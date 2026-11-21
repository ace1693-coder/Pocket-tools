/** 업로드한 사진을 pdf-lib 임베드용 바이트로 준비한다(EXIF 회전 보정 포함). */
import { canvasToBlob, checkPhotoFile, context2d, createCanvas, decodeImage } from './canvasImage';
import { readExif } from './exif';
import type { PdfImageSource } from './pdfImages';

export type PreparedPdfImage = 'image/jpeg' | 'image/png';

export async function prepareImageSource(file: File): Promise<PdfImageSource> {
  const check = checkPhotoFile(file);
  if (!check.ok) throw new Error(check.reason ?? '지원하지 않는 파일입니다.');
  const mime = check.mime ?? file.type;
  const decoded = await decodeImage(file);
  try {
    if (mime === 'image/png') {
      return {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: 'image/png',
        width: decoded.width,
        height: decoded.height,
      };
    }
    if (mime === 'image/jpeg') {
      const report = await readExif(file).catch(() => null);
      const rotated = report?.orientation !== null && report?.orientation !== undefined && report.orientation !== 1;
      if (!rotated) {
        return {
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          mime: 'image/jpeg',
          width: decoded.width,
          height: decoded.height,
        };
      }
      const blob = await reencode(decoded, 'image/jpeg', 0.95);
      return {
        name: file.name,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mime: 'image/jpeg',
        width: decoded.width,
        height: decoded.height,
      };
    }
    // WebP는 pdf-lib이 임베드하지 못하므로 PNG로 변환한다.
    const blob = await reencode(decoded, 'image/png');
    return {
      name: file.name,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: 'image/png',
      width: decoded.width,
      height: decoded.height,
    };
  } finally {
    decoded.close();
  }
}

async function reencode(decoded: Awaited<ReturnType<typeof decodeImage>>, mime: PreparedPdfImage, quality?: number): Promise<Blob> {
  const canvas = createCanvas(decoded.width, decoded.height);
  const ctx = context2d(canvas);
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, mime, mime === 'image/png' ? undefined : quality);
}
