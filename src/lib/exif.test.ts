import { describe, expect, it } from 'vitest';
import piexif from 'piexifjs';
import { formatDateTime, formatGps, formatTagValue, readExif, scanMetadata, verifyNoExif } from './exif';

/** 1×1 실제 JPEG (JFIF만 있고 EXIF 없음) */
export const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z';

export function tinyJpeg(): Uint8Array {
  return new Uint8Array(Buffer.from(TINY_JPEG_BASE64, 'base64'));
}

/** GPS·카메라·촬영일시가 들어간 테스트 JPEG */
export function exifJpeg(): Uint8Array {
  const exif = {
    '0th': {
      [piexif.ImageIFD.Make]: 'PocketCam',
      [piexif.ImageIFD.Model]: 'PC-2026',
      [piexif.ImageIFD.Software]: 'Pocket Tools Test',
      [piexif.ImageIFD.Orientation]: 1,
    },
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2026:11:20 15:04:05' },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [
        [37, 1],
        [34, 1],
        [12, 1],
      ],
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: [
        [126, 1],
        [58, 1],
        [41, 1],
      ],
    },
    '1st': {},
    thumbnail: null,
  };
  const base = Buffer.from(TINY_JPEG_BASE64, 'base64').toString('binary');
  const withExif = piexif.insert(piexif.dump(exif), base);
  return new Uint8Array(Buffer.from(withExif, 'binary'));
}

/** JPEG에서 APP1(EXIF) 세그먼트를 제거한 바이트 (Canvas 재인코딩 결과를 흉내) */
export function stripApp1(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      for (let i = offset; i < bytes.length; i += 1) out.push(bytes[i]);
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const end = offset + 2 + length;
    if (marker !== 0xe1) {
      for (let i = offset; i < end && i < bytes.length; i += 1) out.push(bytes[i]);
    }
    offset = end;
  }
  return new Uint8Array(out);
}

describe('scanMetadata', () => {
  it('EXIF가 심어진 JPEG에서 APP1/Exif 세그먼트를 찾아낸다', () => {
    const scan = scanMetadata(exifJpeg());
    expect(scan.fileKind).toBe('jpeg');
    expect(scan.exif).toBe(true);
    expect(scan.segments).toContain('APP1/Exif');
  });

  it('EXIF를 뺀 JPEG는 exif=false', () => {
    const scan = scanMetadata(stripApp1(exifJpeg()));
    expect(scan.fileKind).toBe('jpeg');
    expect(scan.exif).toBe(false);
    expect(scan.xmp).toBe(false);
  });

  it('PNG 서명과 청크를 인식한다', () => {
    const png = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const scan = scanMetadata(png);
    expect(scan.fileKind).toBe('png');
    expect(scan.exif).toBe(false);
    expect(scan.segments[0]).toBe('IHDR');
    expect(scan.segments).toContain('IEND');
  });
});

describe('readExif', () => {
  it('GPS·카메라·촬영일시를 읽는다', async () => {
    const report = await readExif(exifJpeg());
    expect(report.hasMetadata).toBe(true);
    expect(report.make).toBe('PocketCam');
    expect(report.model).toBe('PC-2026');
    expect(report.gps?.latitude).toBeCloseTo(37.57, 2);
    expect(report.gps?.longitude).toBeCloseTo(126.978, 2);
    expect(report.dateTimeOriginal).toMatch(/^2026-11-20 \d{2}:\d{2}:\d{2}$/);
    expect(report.gpsTagCount).toBeGreaterThan(0);
    expect(report.cameraTagCount).toBeGreaterThanOrEqual(2);
    expect(report.tags.some((tag) => tag.label === '카메라 모델')).toBe(true);
  });

  it('EXIF가 없는 JPEG는 메타데이터 없음으로 본다', async () => {
    const report = await readExif(tinyJpeg());
    expect(report.hasMetadata).toBe(false);
    expect(report.gps).toBeNull();
    expect(report.tagCount).toBe(0);
  });

  it('PNG도 안전하게 처리한다(예외 없이 메타데이터 없음)', async () => {
    const png = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const report = await readExif(png);
    expect(report.hasMetadata).toBe(false);
    expect(report.fileKind).toBe('png');
  });
});

describe('verifyNoExif — 저장 결과 검증', () => {
  it('EXIF가 남아 있으면 실패로 판정하고 수치를 남긴다', async () => {
    const verification = await verifyNoExif(exifJpeg());
    expect(verification.ok).toBe(false);
    expect(verification.exifSegments).toBe(1);
    expect(verification.parsedTagCount).toBeGreaterThan(0);
    expect(verification.gpsTagCount).toBeGreaterThan(0);
    expect(verification.lines.length).toBeGreaterThan(0);
  });

  it('재인코딩된(APP1 없는) JPEG는 0건으로 통과한다', async () => {
    const verification = await verifyNoExif(stripApp1(exifJpeg()));
    expect(verification.ok).toBe(true);
    expect(verification.exifSegments).toBe(0);
    expect(verification.parsedTagCount).toBe(0);
    expect(verification.gpsTagCount).toBe(0);
    expect(verification.cameraTagCount).toBe(0);
  });

  it('PNG 결과도 통과한다', async () => {
    const png = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const verification = await verifyNoExif(png);
    expect(verification.ok).toBe(true);
  });
});

describe('표시 포맷', () => {
  it('GPS 좌표를 도분 형식으로 보여준다', () => {
    expect(formatGps({ latitude: 37.57, longitude: 126.978 })).toBe('37.570000° N, 126.978000° E');
    expect(formatGps({ latitude: -33.5, longitude: -70.6 })).toBe('33.500000° S, 70.600000° W');
  });

  it('태그 값을 사람이 읽을 수 있게 바꾼다', () => {
    expect(formatTagValue([1, 2, 3])).toBe('1, 2, 3');
    expect(formatTagValue(0.5)).toBe('0.5');
    expect(formatTagValue('  hello ')).toBe('hello');
    expect(formatDateTime('2026:11:20 15:04:05')).toBe('2026:11:20 15:04:05');
  });
});
