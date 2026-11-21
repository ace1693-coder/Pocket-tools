/**
 * EXIF 메타데이터 파싱·검사 — exifr(순수 JS) 사용. 파일은 외부로 전송되지 않는다.
 *
 * - readExif: 업로드한 파일에서 GPS·카메라·촬영일시 등 메타데이터를 읽는다.
 * - scanMetadata: 파일 바이트의 실제 세그먼트(APP1 Exif, XMP, IPTC, ICC, PNG eXIf, WebP EXIF)를 직접 훑는다.
 * - verifyNoExif: 저장 직전 만들어진 결과 바이트를 다시 파서에 넣어 EXIF/GPS/카메라 정보가 0건인지 검증한다.
 */
type ExifrModule = typeof import('exifr');
let exifrModule: Promise<ExifrModule> | null = null;
function loadExifr(): Promise<ExifrModule> {
  exifrModule ??= import('exifr');
  return exifrModule;
}

export interface GpsPoint {
  latitude: number;
  longitude: number;
}

export interface ExifTag {
  key: string;
  label: string;
  value: string;
}

export interface ExifReport {
  hasMetadata: boolean;
  gps: GpsPoint | null;
  make: string | null;
  model: string | null;
  lens: string | null;
  software: string | null;
  serial: string | null;
  dateTimeOriginal: string | null;
  orientation: number | null;
  tagCount: number;
  gpsTagCount: number;
  cameraTagCount: number;
  tags: ExifTag[];
  fileKind: FileKind;
}

export type FileKind = 'jpeg' | 'png' | 'webp' | 'unknown';

export interface MetadataScan {
  fileKind: FileKind;
  exif: boolean;
  xmp: boolean;
  iptc: boolean;
  icc: boolean;
  jfif: boolean;
  /** PNG tEXt/zTXt/iTXt, JPEG COM 등 텍스트 메타데이터 개수 */
  textChunks: number;
  /** 사람이 읽을 수 있는 세그먼트 이름 목록 */
  segments: string[];
}

/** 파일 자체의 구조 정보(IHDR/SOF)는 사진 프라이버시 메타데이터가 아니므로 태그 수에서 제외한다. */
const STRUCTURAL_KEYS = new Set(['ImageWidth', 'ImageHeight', 'BitDepth', 'ColorType', 'Compression', 'Filter', 'Interlace']);

const DISPLAY_TAGS: [string, string][] = [
  ['Make', '제조사'],
  ['Model', '카메라 모델'],
  ['LensModel', '렌즈'],
  ['DateTimeOriginal', '촬영 일시'],
  ['DateTime', '수정 일시'],
  ['Software', '소프트웨어'],
  ['SerialNumber', '바디 시리얼'],
  ['BodySerialNumber', '바디 시리얼'],
  ['ExposureTime', '노출 시간'],
  ['FNumber', '조리개'],
  ['ISO', 'ISO'],
  ['FocalLength', '초점 거리'],
  ['Orientation', '방향'],
  ['latitude', '위도'],
  ['longitude', '경도'],
  ['GPSAltitude', '고도'],
  ['UserComment', '사용자 메모'],
  ['Artist', '작성자'],
  ['Copyright', '저작권'],
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(
      value.getMinutes(),
    )}:${pad2(value.getSeconds())}`;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function formatTagValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDateTime(value) ?? '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'number' ? String(item) : formatTagValue(item)))
      .filter((item) => item !== '')
      .join(', ')
      .slice(0, 80);
  }
  if (value instanceof Uint8Array) return `${value.length}B 데이터`;
  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value);
      return text.length > 80 ? `${text.slice(0, 77)}…` : text;
    } catch {
      return '[객체]';
    }
  }
  const text = String(value).trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function detectFileKind(bytes: Uint8Array): FileKind {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return 'unknown';
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function startsWithAscii(bytes: Uint8Array, start: number, text: string): boolean {
  if (start < 0 || start + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[start + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function includesAscii(bytes: Uint8Array, start: number, end: number, text: string): boolean {
  const limit = Math.min(end, bytes.length) - text.length;
  for (let i = start; i <= limit; i += 1) {
    if (startsWithAscii(bytes, i, text)) return true;
  }
  return false;
}

function scanPng(bytes: Uint8Array, scan: MetadataScan): void {
  let offset = 8;
  let guard = 0;
  while (offset + 8 <= bytes.length && guard < 4096) {
    guard += 1;
    const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    const type = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type) || length > bytes.length) break;
    scan.segments.push(type);
    if (type === 'eXIf') scan.exif = true;
    if (type === 'iCCP') scan.icc = true;
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') scan.textChunks += 1;
    if (type === 'IEND') break;
    offset += 12 + length;
  }
}

function scanJpeg(bytes: Uint8Array, scan: MetadataScan): void {
  let offset = 2;
  let guard = 0;
  while (offset + 3 < bytes.length && guard < 4096) {
    guard += 1;
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 4 > bytes.length) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) break;
    const start = offset + 4;
    const end = offset + 2 + length;
    if (end > bytes.length) break;
    if (marker === 0xe1) {
      if (startsWithAscii(bytes, start, 'Exif\0\0')) {
        scan.exif = true;
        scan.segments.push('APP1/Exif');
      } else if (includesAscii(bytes, start, end, 'http://ns.adobe.com/xap/1.0/')) {
        scan.xmp = true;
        scan.segments.push('APP1/XMP');
      } else {
        scan.segments.push('APP1');
      }
    } else if (marker === 0xed) {
      scan.iptc = true;
      scan.segments.push('APP13/IPTC');
    } else if (marker === 0xe2) {
      if (startsWithAscii(bytes, start, 'ICC_PROFILE')) {
        scan.icc = true;
        scan.segments.push('APP2/ICC');
      } else {
        scan.segments.push('APP2');
      }
    } else if (marker === 0xe0) {
      if (startsWithAscii(bytes, start, 'JFIF')) {
        scan.jfif = true;
        scan.segments.push('APP0/JFIF');
      } else {
        scan.segments.push('APP0');
      }
    } else if (marker === 0xfe) {
      scan.textChunks += 1;
      scan.segments.push('COM');
    } else {
      scan.segments.push(`0x${marker.toString(16).toUpperCase().padStart(2, '0')}`);
    }
    offset = end;
  }
}

function scanWebp(bytes: Uint8Array, scan: MetadataScan): void {
  let offset = 12;
  let guard = 0;
  while (offset + 8 <= bytes.length && guard < 1024) {
    guard += 1;
    const fourcc = ascii(bytes, offset, 4);
    const size =
      (bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24)) >>> 0;
    scan.segments.push(fourcc);
    if (fourcc === 'EXIF') scan.exif = true;
    if (fourcc === 'XMP ') scan.xmp = true;
    if (fourcc === 'ICCP') scan.icc = true;
    offset += 8 + size + (size % 2);
  }
}

/** 파일 바이트에서 메타데이터 세그먼트를 직접 훑는다(파서와 독립된 2차 증빙). */
export function scanMetadata(input: ArrayBuffer | Uint8Array): MetadataScan {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const scan: MetadataScan = {
    fileKind: detectFileKind(bytes),
    exif: false,
    xmp: false,
    iptc: false,
    icc: false,
    jfif: false,
    textChunks: 0,
    segments: [],
  };
  if (scan.fileKind === 'jpeg') scanJpeg(bytes, scan);
  else if (scan.fileKind === 'png') scanPng(bytes, scan);
  else if (scan.fileKind === 'webp') scanWebp(bytes, scan);
  else if (includesAscii(bytes, 0, bytes.length, 'Exif\0\0')) scan.exif = true;
  return scan;
}

/** 업로드 파일의 EXIF를 읽어 화면 표시용으로 정리한다. */
export async function readExif(input: Blob | ArrayBuffer | Uint8Array): Promise<ExifReport> {
  let bytes: Uint8Array;
  if (input instanceof Uint8Array) bytes = input;
  else if (typeof Blob !== 'undefined' && input instanceof Blob) bytes = new Uint8Array(await input.arrayBuffer());
  else bytes = new Uint8Array(input as ArrayBuffer);
  const fileKind = detectFileKind(bytes);
  let parsed: Record<string, unknown> | undefined;
  try {
    const { default: exifr } = await loadExifr();
    parsed = await exifr.parse(bytes as Uint8Array, {
      tiff: true,
      exif: true,
      gps: true,
      interop: false,
      makerNote: false,
      userComment: true,
      xmp: false,
      icc: false,
      iptc: false,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
    });
  } catch {
    parsed = undefined;
  }

  const record = (parsed ?? {}) as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => !STRUCTURAL_KEYS.has(key));
  const latitude = typeof record.latitude === 'number' ? record.latitude : null;
  const longitude = typeof record.longitude === 'number' ? record.longitude : null;
  const gps: GpsPoint | null = latitude !== null && longitude !== null ? { latitude, longitude } : null;

  const tags: ExifTag[] = [];
  for (const [key, label] of DISPLAY_TAGS) {
    if (!(key in record)) continue;
    const value = formatTagValue(record[key]);
    if (!value) continue;
    tags.push({ key, label, value });
  }

  const make = typeof record.Make === 'string' ? record.Make.trim() : null;
  const model = typeof record.Model === 'string' ? record.Model.trim() : null;
  const lens = typeof record.LensModel === 'string' ? record.LensModel.trim() : null;
  const software = typeof record.Software === 'string' ? record.Software.trim() : null;
  const serialCandidates = [record.SerialNumber, record.BodySerialNumber, record.LensSerialNumber];
  const serial = serialCandidates.find((value): value is string => typeof value === 'string' && value.trim() !== '') ?? null;
  const orientation = typeof record.Orientation === 'number' ? record.Orientation : null;

  const gpsTagCount = Object.keys(record).filter((key) => key.startsWith('GPS') || key === 'latitude' || key === 'longitude').length;
  const cameraTagCount = [make, model, lens, serial].filter(Boolean).length;

  return {
    hasMetadata: keys.length > 0,
    gps,
    make,
    model,
    lens,
    software,
    serial,
    dateTimeOriginal: formatDateTime(record.DateTimeOriginal) ?? formatDateTime(record.DateTime),
    orientation,
    tagCount: keys.length,
    gpsTagCount,
    cameraTagCount,
    tags,
    fileKind,
  };
}

export interface StripVerification {
  ok: boolean;
  /** 결과 파일에서 발견된 EXIF 세그먼트 수(0이어야 함) */
  exifSegments: number;
  /** 결과 파일에서 파서가 읽어낸 태그 수(0이어야 함) */
  parsedTagCount: number;
  gpsTagCount: number;
  cameraTagCount: number;
  scan: MetadataScan;
  lines: string[];
}

/** 저장 직전 만들어진 결과 바이트에서 EXIF/GPS/카메라 정보가 완전히 제거됐는지 검증한다. */
export async function verifyNoExif(input: ArrayBuffer | Uint8Array): Promise<StripVerification> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const scan = scanMetadata(bytes);
  let report: ExifReport | null = null;
  try {
    report = await readExif(bytes);
  } catch {
    report = null;
  }
  const parsedTagCount = report?.tagCount ?? 0;
  const gpsTagCount = report?.gpsTagCount ?? 0;
  const cameraTagCount = report?.cameraTagCount ?? 0;
  const exifSegments = scan.exif ? 1 : 0;
  const ok = exifSegments === 0 && parsedTagCount === 0 && gpsTagCount === 0 && cameraTagCount === 0;

  const lines = [
    `결과 바이트 재검사: EXIF 세그먼트 ${exifSegments}건 · 파서 태그 ${parsedTagCount}건`,
    `GPS 정보 ${gpsTagCount}건 · 카메라 정보 ${cameraTagCount}건`,
    `XMP ${scan.xmp ? '1건' : '0건'} · IPTC ${scan.iptc ? '1건' : '0건'} · 텍스트 메타데이터 ${scan.textChunks}건`,
    `검사 세그먼트: ${scan.segments.length ? scan.segments.slice(0, 12).join(' · ') : '없음'}`,
  ];

  return { ok, exifSegments, parsedTagCount, gpsTagCount, cameraTagCount, scan, lines };
}

export function formatGps(point: GpsPoint): string {
  return `${Math.abs(point.latitude).toFixed(6)}° ${point.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(point.longitude).toFixed(6)}° ${
    point.longitude >= 0 ? 'E' : 'W'
  }`;
}
