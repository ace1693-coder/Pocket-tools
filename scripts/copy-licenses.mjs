/**
 * 배포물에 포함되는 오픈소스 라이선스 원문을 public/licenses/ 로 복사한다.
 * (MIT: 저작권 고지 유지, Apache-2.0: 라이선스·NOTICE 유지)
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const modules = join(root, 'node_modules');
const target = join(root, 'public', 'licenses');
mkdirSync(target, { recursive: true });

const files = [
  ['pdfjs-dist', 'LICENSE', 'pdfjs-dist-LICENSE.txt'],
  ['pdf-lib', 'LICENSE.md', 'pdf-lib-LICENSE.md'],
  ['exifr', 'LICENSE', 'exifr-LICENSE.txt'],
  ['jszip', 'LICENSE.markdown', 'jszip-LICENSE.markdown'],
  ['react', 'LICENSE', 'react-LICENSE.txt'],
  ['react-dom', 'LICENSE', 'react-dom-LICENSE.txt'],
];

let copied = 0;
for (const [pkg, from, to] of files) {
  const source = join(modules, pkg, from);
  if (!existsSync(source)) {
    console.warn(`[licenses] ${pkg}/${from} 없음 — 건너뜀`);
    continue;
  }
  copyFileSync(source, join(target, to));
  copied += 1;
}

console.log(`[licenses] public/licenses/ 복사 완료 (${copied}개)`);
