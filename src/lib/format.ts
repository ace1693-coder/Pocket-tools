/** 용량·숫자 표시용 순수 유틸 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

/** 절감률(%) — (원본-결과)/원본*100, 소수 1자리. 원본 0이면 null */
export function savingsPercent(originalSize: number, resultSize: number): number | null {
  if (!originalSize || originalSize <= 0) return null;
  return Math.round(((originalSize - resultSize) / originalSize) * 1000) / 10;
}

export function formatPercent(value: number | null): string {
  if (value === null) return '-';
  const sign = value > 0 ? '-' : value < 0 ? '+' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function formatExtension(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'JPG';
    case 'image/png':
      return 'PNG';
    case 'image/webp':
      return 'WebP';
    default:
      return mime.replace('image/', '').toUpperCase();
  }
}
