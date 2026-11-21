/** 클립보드 유틸 — 지원하지 않는 환경에서는 안내 문구로 대체 */

export async function copyText(text: string): Promise<{ ok: boolean; method: 'clipboard' | 'fallback' }> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard' };
    } catch {
      /* fallback 시도 */
    }
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return { ok, method: 'fallback' };
  } catch {
    return { ok: false, method: 'fallback' };
  }
}

export function canCopyImage(): boolean {
  return typeof window !== 'undefined' && typeof window.ClipboardItem === 'function' && !!navigator.clipboard?.write;
}

export async function copyImage(blob: Blob): Promise<{ ok: boolean; reason?: string }> {
  if (!canCopyImage()) {
    return { ok: false, reason: '이 브라우저는 이미지 복사를 지원하지 않습니다. 아래 PNG 다운로드를 이용해 주세요.' };
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return { ok: true };
  } catch {
    return { ok: false, reason: '이미지를 복사하지 못했습니다. 브라우저 권한을 확인하거나 PNG 다운로드를 이용해 주세요.' };
  }
}

export function downloadBlobUrl(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
