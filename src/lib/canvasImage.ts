/** 브라우저 Canvas 기반 이미지 입출력 공용 유틸. 모든 처리는 기기 안에서만 이루어진다. */

const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

export interface FileCheck {
  ok: boolean;
  reason?: string;
  mime?: string;
}

function extensionToMime(ext: string): string {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/** 사진 파일 검사(형식·용량) — 도구별 안내 문구를 위해 중립적으로 반환한다. */
export function checkPhotoFile(file: { name: string; type: string; size: number }, maxMB = 40): FileCheck {
  const name = file.name.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const typeOk = PHOTO_MIME.includes(file.type);
  const extOk = PHOTO_EXT.includes(ext);
  if (!typeOk && !extOk) {
    return {
      ok: false,
      reason: `지원하지 않는 파일입니다(${ext || '확장자 없음'}). JPG · PNG · WebP 이미지를 선택해 주세요.`,
    };
  }
  if (file.type && !file.type.startsWith('image/')) {
    return { ok: false, reason: '이미지 파일이 아닙니다. JPG · PNG · WebP 파일을 선택해 주세요.' };
  }
  if (file.size === 0) {
    return { ok: false, reason: '빈 파일입니다. 다른 이미지를 선택해 주세요.' };
  }
  if (file.size > maxMB * 1024 * 1024) {
    return { ok: false, reason: `파일이 너무 큽니다(${maxMB}MB 초과). ${maxMB}MB 이하 이미지를 선택해 주세요.` };
  }
  return { ok: true, mime: PHOTO_MIME.includes(file.type) ? file.type : extensionToMime(ext) };
}

export interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  close: () => void;
}

/** Blob/File을 CanvasImageSource로 디코딩한다. EXIF 회전 정보는 from-image로 자동 반영. */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      };
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

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 이미지를 처리할 수 없습니다.');
  return ctx;
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이 브라우저에서는 선택한 형식으로 저장할 수 없습니다. 다른 형식을 선택해 주세요.'));
          return;
        }
        if (blob.type && blob.type !== mime) {
          reject(new Error('이 브라우저가 선택한 출력 형식을 지원하지 않습니다. WebP 또는 JPEG를 선택해 주세요.'));
          return;
        }
        resolve(blob);
      },
      mime,
      quality,
    );
  });
}

export function mimeExtension(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function suffixFileName(originalName: string, suffix: string, mime: string): string {
  return `${stripExtension(originalName)}-${suffix}.${mimeExtension(mime)}`;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Blob을 실제 파일로 내려받는다(다운로드 링크 클릭). */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
