/**
 * pdf.js 정적 자산을 public/pdfjs/ 로 복사한다.
 * - 워커(pdf.worker.min.mjs)·표준 폰트·CMap·WASM·ICC를 모두 로컬에서 서빙해 외부 CDN 요청을 0건으로 유지한다.
 * - npm run build / test:e2e 전에 자동 실행된다(버전이 바뀌면 다시 복사).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = join(root, 'node_modules', 'pdfjs-dist');
const target = join(root, 'public', 'pdfjs');

if (!existsSync(source)) {
  console.error('[pdfjs-assets] node_modules/pdfjs-dist 가 없습니다. npm install 을 먼저 실행하세요.');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

// 워커는 별도 전역이라 메인 스레드 폴리필이 닿지 않는다. 워커 파일 앞에 폴리필을 붙여 저장한다.
const workerPolyfill = readFileSync(join(here, 'worker-polyfill.js'), 'utf8');
const workerSource = readFileSync(join(source, 'build', 'pdf.worker.min.mjs'), 'utf8');
writeFileSync(join(target, 'pdf.worker.min.mjs'), `${workerPolyfill}\n${workerSource}`);
for (const dir of ['standard_fonts', 'cmaps', 'wasm', 'iccs']) {
  const from = join(source, dir);
  if (existsSync(from)) cpSync(from, join(target, dir), { recursive: true });
}

console.log('[pdfjs-assets] public/pdfjs/ 복사 완료 (worker + standard_fonts + cmaps + wasm + iccs)');
