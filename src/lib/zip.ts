/** ZIP 묶음 생성 (JSZip) — 브라우저 메모리 안에서만 처리 */
type JSZipCtor = typeof import('jszip');
let cached: Promise<{ default: JSZipCtor }> | null = null;
function loadJSZip(): Promise<{ default: JSZipCtor }> {
  cached ??= import('jszip');
  return cached;
}

export interface ZipEntry {
  name: string;
  data: Blob | Uint8Array | ArrayBuffer;
}

async function toBytes(data: ZipEntry['data']): Promise<Uint8Array | ArrayBuffer> {
  if (data instanceof Uint8Array) return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return await data.arrayBuffer();
  return data as ArrayBuffer;
}

/** 같은 이름이 있으면 `이름 (2).확장자`로 구분한다. */
export function uniqueFileNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    return `${base} (${count + 1})${ext}`;
  });
}

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  if (!entries.length) throw new Error('묶을 파일이 없습니다.');
  const { default: JSZip } = await loadJSZip();
  const zip = new JSZip();
  const names = uniqueFileNames(entries.map((entry) => entry.name));
  for (let i = 0; i < entries.length; i += 1) {
    zip.file(names[i], await toBytes(entries[i].data));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function zipFileName(prefix: string, count: number, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${prefix}-${count}장-${stamp}.zip`;
}
