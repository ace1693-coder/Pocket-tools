/**
 * 배포된 Pocket Tools(https://ace1693-coder.github.io/<repo>/) 실기기 조건 검증
 *
 * - 모바일 뷰포트 390×844, DPR 3, isMobile·hasTouch, ko-KR, Asia/Seoul
 * - 7개 탭 진입, URL 정리, 이미지 압축+다운로드, QR 생성+PNG, PDF 왕복, EXIF 제거
 * - 콘솔/페이지 에러 수집, 외부 오리진 요청 수집(0건이어야 함)
 * - Service Worker·Manifest 확인, 새로고침 후 재확인
 *
 * 실행: LD_LIBRARY_PATH=<atk libs> node e2e/live-check.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import exifr from 'exifr';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const BASE = (process.argv[2] || 'https://ace1693-coder.github.io/Pocket-tools/').replace(/\/?$/, '/');
const SHOTS = join(root, 'deploy-evidence');
const FIX = join(root, 'e2e', 'fixtures');
mkdirSync(SHOTS, { recursive: true });

const checks = [];
const log = (group, name, ok, detail = '') => {
  checks.push({ group, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${group} · ${name}${detail ? ` — ${detail}` : ''}`);
};

const external = [];
const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  acceptDownloads: true,
});
const page = await context.newPage();
const origin = new URL(BASE).origin;
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:')) external.push(u.slice(0, 120));
});

const blobBytes = async (sel) => page.evaluate(async (s) => {
  const a = document.querySelector(s);
  if (!a) return null;
  const res = await fetch(a.href);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { size: buf.length, b64: btoa(bin), name: a.getAttribute('download') || '' };
}, sel);

const jpegDims = (buf) => {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};

// 1) 첫 로드
const t0 = Date.now();
const resp = await page.goto(BASE, { waitUntil: 'load' });
log('기본', 'HTTPS 첫 로드', resp.status() === 200, `HTTP ${resp.status()} · ${Date.now() - t0}ms · ${page.url()}`);
log('기본', '모바일 뷰포트 390×844', (await page.evaluate(() => innerWidth)) === 390, `innerWidth=${await page.evaluate(() => innerWidth)}, innerHeight=${await page.evaluate(() => innerHeight)}, dpr=${await page.evaluate(() => devicePixelRatio)}`);

const metrics = () => page.evaluate(() => ({
  sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  bw: document.body.scrollWidth, title: document.title,
}));
let m = await metrics();
log('기본', '가로 스크롤 0 (첫 화면)', m.sw <= m.cw, `scrollWidth ${m.sw} ≤ clientWidth ${m.cw}`);

const tabNames = ['URL 정리', '이미지 압축', '비율 조정', 'PDF ↔ 이미지', 'EXIF·모자이크', '워터마크', 'QR 생성'];
for (const name of tabNames) {
  const tab = page.getByRole('tab', { name, exact: true });
  await tab.click();
  await page.waitForTimeout(150);
  const visible = await page.getByRole('tabpanel').isVisible();
  const mm = await metrics();
  const label = await page.getByRole('heading', { level: 2 }).first().textContent().catch(() => '');
  log('탭', `진입: ${name}`, visible && mm.sw <= mm.cw, `패널 표시=${visible}, 가로스크롤 ${mm.sw}/${mm.cw}, 제목="${(label || '').trim()}"`);
}
await page.screenshot({ path: join(SHOTS, '10-mobile-390-tabs.png') });

// 2) URL 정리
await page.getByRole('tab', { name: 'URL 정리', exact: true }).click();
await page.getByTestId('url-example-button').click();
await page.getByTestId('url-clean-button').click();
await page.waitForSelector('[data-testid=url-summary]', { timeout: 10000 });
const urlSummary = (await page.getByTestId('url-summary').textContent()) || '';
const cleaned = (await page.getByTestId('url-cleaned').textContent()) || '';
const urlOk = /5개/.test(urlSummary) && /2개/.test(urlSummary);
log('URL', '추적 파라미터 제거', urlOk, `요약="${urlSummary.trim().slice(0, 80)}" · 결과=${(cleaned || '').trim().slice(0, 80)}`);
await page.screenshot({ path: join(SHOTS, '11-mobile-390-url.png') });

// 3) 이미지 압축 + 실제 다운로드
await page.getByRole('tab', { name: '이미지 압축', exact: true }).click();
await page.getByTestId('image-input').setInputFiles(join(FIX, 'test-photo.jpg'));
await page.waitForSelector('[data-testid=image-download]', { timeout: 20000 });
const imgDl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await page.getByTestId('image-download').click();
const dl = await imgDl;
let imgInfo = '';
if (dl) {
  const p = join(here, 'downloads', `live-${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(p);
  const b = (await import('node:fs')).readFileSync(p);
  const dim = jpegDims(b);
  imgInfo = `${dl.suggestedFilename()} ${b.length}B ${dim ? dim.w + 'x' + dim.h : ''}`;
  log('이미지', '압축 이미지 다운로드', b.length > 1000 && !!dim && dim.w === 1600, imgInfo);
} else {
  const b = await blobBytes('[data-testid=image-download]');
  log('이미지', '압축 이미지 다운로드', false, '다운로드 이벤트 없음, blob 크기=' + (b ? b.size : 'n/a'));
}
const before = await page.getByTestId('size-before').textContent();
const after = await page.getByTestId('size-after').textContent();
const savings = await page.getByTestId('size-savings').textContent();
log('이미지', '처리 통계 표시', !!before && !!after, `원본 ${before} → ${after} (${savings})`);
await page.screenshot({ path: join(SHOTS, '12-mobile-390-image.png') });

// 4) QR 생성 + PNG
await page.getByRole('tab', { name: 'QR 생성', exact: true }).click();
await page.getByRole('textbox').fill(BASE);
await page.getByRole('button', { name: 'QR 만들기' }).click();
await page.waitForSelector('button:has-text("PNG 다운로드")', { timeout: 20000 });
const qrDl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await page.getByRole('button', { name: 'PNG 다운로드' }).click();
const qrd = await qrDl;
if (qrd) {
  const p = join(here, 'downloads', `live-qr-${Date.now()}.png`);
  await qrd.saveAs(p);
  const png = PNG.sync.read((await import('node:fs')).readFileSync(p));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  log('QR', 'QR PNG 다운로드·내용 일치', png.width === 1024 && decoded && decoded.data === BASE,
    `${png.width}x${png.height} · 디코드="${decoded ? decoded.data : 'none'}"`);
} else {
  log('QR', 'QR PNG 다운로드·내용 일치', false, '다운로드 이벤트 없음');
}
await page.screenshot({ path: join(SHOTS, '13-mobile-390-qr.png') });

// 5) 이미지 → PDF → 다시 PDF → 이미지 왕복
await page.getByRole('tab', { name: 'PDF ↔ 이미지', exact: true }).click();
await page.getByRole('button', { name: '이미지 → PDF' }).click();
await page.getByTestId('pdfimg-input').setInputFiles([join(FIX, 'test-photo.jpg'), join(FIX, 'test-graphic.png')]);
await page.getByTestId('pdfimg-generate').click();
await page.waitForSelector('[data-testid=pdfimg-download]', { timeout: 60000 });
const pdfBlob = await blobBytes('[data-testid=pdfimg-download]');
const pdfBytes = Buffer.from(pdfBlob.b64, 'base64');
const pdf = await PDFDocument.load(pdfBytes);
const sizes = pdf.getPages().map((p) => { const s = p.getSize(); return `${Math.round(s.width)}x${Math.round(s.height)}`; });
log('PDF', '이미지 → PDF 생성', pdf.getPageCount() === 2 && pdfBytes.length > 10000, `${pdfBytes.length}B · ${pdf.getPageCount()}페이지 · ${sizes.join(', ')}`);
const pdfPath = join(here, 'downloads', `live-${Date.now()}-roundtrip.pdf`);
(await import('node:fs')).writeFileSync(pdfPath, pdfBytes);

await page.getByRole('button', { name: 'PDF → 이미지' }).click();
await page.getByTestId('pdf-input').setInputFiles(pdfPath);
await page.waitForSelector('[data-testid=pdf-page-1]', { timeout: 90000 });
const figs = await page.locator('figure').count();
const figLabel = (await page.locator('figure').first().getAttribute('aria-label')) || '';
log('PDF', 'PDF → 이미지 렌더', figs >= 2, `${figs}페이지 렌더 · 첫쪽="${figLabel}"`);
await page.screenshot({ path: join(SHOTS, '14-mobile-390-pdf.png') });

// 6) EXIF 제거
await page.getByRole('tab', { name: 'EXIF·모자이크', exact: true }).click();
await page.getByTestId('exif-input').setInputFiles(join(FIX, 'exif-photo.jpg'));
await page.waitForSelector('[data-testid=exif-info]', { timeout: 20000 });
const detectedSummary = (await page.getByTestId('exif-summary').textContent()) || '';
const detectedGps = (await page.getByTestId('exif-gps').textContent()) || '';
const detectedCam = (await page.getByTestId('exif-camera').textContent()) || '';
const detectedDate = (await page.getByTestId('exif-date').textContent()) || '';
const detected = `${detectedSummary.trim()} · GPS=${detectedGps.trim()} · 카메라=${detectedCam.trim()} · 촬영=${detectedDate.trim()}`;
await page.getByTestId('exif-save').click();
await page.waitForSelector('[data-testid=exif-download]', { timeout: 30000 });
const exBlob = await blobBytes('[data-testid=exif-download]');
const exBytes = Buffer.from(exBlob.b64, 'base64');
const tags = await exifr.parse(exBytes, { tiff: true, exif: true, gps: true }).catch(() => null);
const app1 = exBytes.includes(Buffer.from('Exif\u0000\u0000', 'latin1'));
log('EXIF', '메타데이터 검출', /37\.5/.test(detectedGps) && /PocketCam/.test(detectedCam), detected.slice(0, 140));
log('EXIF', '저장 결과 EXIF 0건', !tags && !app1, `${exBytes.length}B · 태그 ${tags ? Object.keys(tags).length : 0}개 · APP1=${app1}`);

// 7) Service Worker · Manifest
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? { scope: reg.scope, active: !!reg.active, state: reg.active && reg.active.state, controlled: !!navigator.serviceWorker.controller } : null;
});
log('PWA', 'Service Worker 등록·제어', !!sw && sw.active && sw.controlled, JSON.stringify(sw));
const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
log('PWA', 'Manifest 유효', manifest.display === 'standalone' && manifest.icons.length >= 2 && !!manifest.start_url,
  `${manifest.name} · display=${manifest.display} · icons=${manifest.icons.map((i) => i.sizes).join('/')}`);

// 8) 외부 요청 집계
log('보안', '외부 오리진 요청 0건', external.length === 0, external.length ? external.slice(0, 5).join(' | ') : '전송된 외부 요청 없음');

// 9) 새로고침 후
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(800);
const afterReload = await metrics();
const swAfter = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { controlled: !!navigator.serviceWorker.controller, active: !!(reg && reg.active) };
});
await page.getByTestId('url-clean-button').click().catch(() => {});
const afterTitle = await page.locator('h1').textContent();
log('재로드', '새로고침 후 정상', afterTitle.includes('Pocket Tools') && afterReload.sw <= afterReload.cw && swAfter.active,
  `제목="${afterTitle}" · 가로스크롤 ${afterReload.sw}/${afterReload.cw} · SW ${JSON.stringify(swAfter)}`);
await page.screenshot({ path: join(SHOTS, '15-mobile-390-reload.png') });

// 10) 콘솔/페이지 에러
log('안정성', '콘솔 에러 0 · 페이지 에러 0', consoleErrors.length === 0 && pageErrors.length === 0,
  `console=${consoleErrors.length}${consoleErrors[0] ? ` (${consoleErrors[0]})` : ''} · page=${pageErrors.length}${pageErrors[0] ? ` (${pageErrors[0]})` : ''}`);

const summary = {
  base: BASE,
  at: new Date().toISOString(),
  viewport: '390x844 @3x mobile',
  total: checks.length,
  passed: checks.filter((c) => c.ok).length,
  externalRequests: external.length,
  consoleErrors,
  pageErrors,
  checks,
};
writeFileSync(join(SHOTS, 'live-check-report.json'), JSON.stringify(summary, null, 2));
console.log(`\n총 ${summary.total}항목 · 통과 ${summary.passed} · 외부 요청 ${external.length}건 · 콘솔에러 ${consoleErrors.length} · 페이지에러 ${pageErrors.length}`);
await browser.close();
process.exit(summary.passed === summary.total ? 0 : 1);
