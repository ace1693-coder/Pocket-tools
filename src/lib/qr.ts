/** QR 코드 생성 — qrcode (MIT). Canvas에 직접 그려 고해상도 PNG로 저장한다. */

import QRCode from 'qrcode';

export const QR_PIXEL_SIZE = 1024;

export interface QrRenderResult {
  dataUrl: string;
  text: string;
}

export function qrFileName(text: string, when = new Date()): string {
  const stamp = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(
    when.getDate(),
  ).padStart(2, '0')}-${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}${String(
    when.getSeconds(),
  ).padStart(2, '0')}`;
  const slug = text
    .replace(/^https?:\/\//i, '')
    .replace(/[^0-9a-zA-Z가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `qr-${slug || 'code'}-${stamp}.png`;
}

/** 입력값 검증 — 문제가 있으면 한글 메시지, 없으면 null */
export function validateQrInput(text: string): string | null {
  if (!text.trim()) return 'QR 코드로 만들 내용을 입력해 주세요.';
  if (text.length > 1200) return '내용이 너무 깁니다(1200자 이하). 짧게 줄여 주세요.';
  return null;
}

export async function renderQrToCanvas(canvas: HTMLCanvasElement, text: string): Promise<string> {
  const error = validateQrInput(text);
  if (error) throw new Error(error);
  try {
    await QRCode.toCanvas(canvas, text, {
      width: QR_PIXEL_SIZE,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000ff', light: '#ffffffff' },
    });
  } catch {
    throw new Error('QR 코드를 만들지 못했습니다. 내용을 조금 줄이거나 다른 문자로 다시 시도해 주세요.');
  }
  // qrcode가 캔버스에 인라인 px 크기를 넣으므로, 화면 크기는 CSS(반응형)가 결정하게 비운다.
  canvas.style.width = '';
  canvas.style.height = '';
  return canvas.toDataURL('image/png');
}

export async function createQrDataUrl(text: string): Promise<QrRenderResult> {
  const error = validateQrInput(text);
  if (error) throw new Error(error);
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: QR_PIXEL_SIZE,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000ff', light: '#ffffffff' },
    });
    return { dataUrl, text };
  } catch {
    throw new Error('QR 코드를 만들지 못했습니다. 내용을 조금 줄이거나 다른 문자로 다시 시도해 주세요.');
  }
}
