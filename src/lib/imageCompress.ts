/** 이미지 압축 — 100% 브라우저 Canvas API. 서버 전송 없음. */

import { savingsPercent } from './format';

export type OutputFormat = 'original' | 'image/webp' | 'image/jpeg' | 'image/png';

export interface CompressOptions {
  quality: number; // 0.1 ~ 1.0
  format: OutputFormat;
}

export interface CompressResult {
  blob: Blob;
  url: string;
  mime: string;
  width: number;
  height: number;
  size: number;
  originalSize: number;
  savings: number | null;
  durationMs: number;
}

export interface FileCheck {
  ok: boolean;
  reason?: string;
  mime?: string;
}

const SUPPORTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const SUPPORTED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

/** 업로드 파일 검사: 지원 형식/확장자/용량 */
export function checkImageFile(file: { name: string; type: string; size: number }): FileCheck {
  const name = file.name.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const typeOk = SUPPORTED_MIME.includes(file.type);
  const extOk = SUPPORTED_EXT.includes(ext);

  if (!typeOk && !extOk) {
    const shownExt = ext || '확장자 없음';
    return {
      ok: false,
      reason: `지원하지 않는 파일입니다(${shownExt}). JPG · PNG · WebP 이미지만 압축할 수 있습니다.`,
    };
  }
  if (file.type && !file.type.startsWith('image/')) {
    return { ok: false, reason: '이미지 파일이 아닙니다. JPG · PNG · WebP 파일을 선택해 주세요.' };
  }
  if (file.size === 0) {
    return { ok: false, reason: '빈 파일입니다. 다른 이미지를 선택해 주세요.' };
  }
  if (file.size > 40 * 1024 * 1024) {
    return { ok: false, reason: '파일이 너무 큽니다(40MB 초과). 40MB 이하 이미지를 선택해 주세요.' };
  }
  const mime = SUPPORTED_MIME.includes(file.type) ? file.type : extToMime(ext);
  return { ok: true, mime };
}

function extToMime(ext: string): string {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function decode(file: File): Promise<{ width: number; height: number; source: CanvasImageSource; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
    } catch {
      /* 아래 Image 경로로 재시도 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode-failed'));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: img,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('이미지를 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식입니다.');
  }
}

function targetMime(format: OutputFormat, sourceMime: string): string {
  if (format === 'original') return SUPPORTED_MIME.includes(sourceMime) ? sourceMime : 'image/jpeg';
  return format;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

export async function compressImage(file: File, options: CompressOptions): Promise<CompressResult> {
  const started = performance.now();
  const check = checkImageFile(file);
  if (!check.ok) throw new Error(check.reason ?? '지원하지 않는 파일입니다.');

  const decoded = await decode(file);
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error('이미지 크기를 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서는 이미지를 처리할 수 없습니다.');

    const mime = targetMime(options.format, check.mime ?? file.type);
    // JPEG은 투명 영역이 검게 변하므로 흰색 배경을 먼저 칠한다.
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    const quality = Math.min(1, Math.max(0.1, options.quality));
    const blob = await canvasToBlob(canvas, mime, mime === 'image/png' ? undefined : quality);
    if (!blob) {
      throw new Error('이 브라우저에서는 선택한 형식으로 저장할 수 없습니다. 다른 형식을 선택해 주세요.');
    }
    if (blob.type && blob.type !== mime) {
      throw new Error('이 브라우저가 선택한 출력 형식을 지원하지 않습니다. WebP 또는 JPEG를 선택해 주세요.');
    }

    return {
      blob,
      url: URL.createObjectURL(blob),
      mime,
      width: canvas.width,
      height: canvas.height,
      size: blob.size,
      originalSize: file.size,
      savings: savingsPercent(file.size, blob.size),
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    decoded.close();
  }
}

export function outputFileName(originalName: string, mime: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg';
  return `${base}-압축.${ext}`;
}
