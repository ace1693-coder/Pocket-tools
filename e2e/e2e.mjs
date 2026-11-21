/**
 * Pocket Tools 실제 동작 검증 (headless Chromium, 모바일 뷰포트 390×844)
 *
 * 1차 기능 회귀(URL 정리 / 이미지 압축 / QR) + 2차 기능 4종(비율·PDF↔이미지·EXIF·모자이크·워터마크)을
 * 실제 파일 업로드·렌더링·다운로드 결과까지 확인한다.
 *
 * 실행: node e2e/e2e.mjs   (dist 빌드 결과를 자체 정적 서버로 서빙)
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import exifr from 'exifr';
import piexif from 'piexifjs';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const distDir = join(root, 'dist');
const shotDir = join(root, 'screenshots');
const fixtureDir = join(root, 'e2e', 'fixtures');
const dlDir = join(root, 'e2e', 'downloads');
for (const dir of [shotDir, fixtureDir, dlDir]) mkdirSync(dir, { recursive: true });

const PORT = 4319;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUBPATH = `${ORIGIN}/pocket-tools/`;
const VIEWPORT = { width: 390, height: 844 };

const PHOTO = { width: 1600, height: 1200 };
const PHOTO2 = { width: 600, height: 400 };
const GRAPHIC = { width: 800, height: 600 };
const EXIF_PHOTO = { width: 1000, height: 800 };
const LOGO = { width: 240, height: 80 };

const checks = [];
function record(group, name, ok, detail) {
  checks.push({ group, name, ok: Boolean(ok), detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${group} · ${name}${detail ? ` — ${detail}` : ''}`);
}
async function run(name, fn) {
  try {
    const detail = await fn();
    if (detail !== undefined) record(name.group, name.title, detail?.ok ?? true, detail?.detail ?? '');
  } catch (error) {
    record(name.group, name.title, false, `예외: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* ── 정적 서버 (루트 / 와 하위 경로 /pocket-tools/ 둘 다 서빙) ── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pfb': 'application/octet-stream',
  '.bcmap': 'application/octet-stream',
  '.icc': 'application/octet-stream',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith('/pocket-tools/')) pathname = pathname.slice('/pocket-tools'.length);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = normalize(join(distDir, pathname));
  if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(readFileSync(filePath));
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

/* ── 브라우저 ── */
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: VIEWPORT,
  screen: VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  acceptDownloads: true,
});

const consoleErrors = [];
const pageErrors = [];
const externalRequests = [];
const localOnlyRequests = [];
const requestLog = [];

context.on('request', (request) => {
  const url = request.url();
  requestLog.push({ url, type: request.resourceType() });
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      localOnlyRequests.push({ url: parsed.protocol, type: request.resourceType() });
      return;
    }
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
      externalRequests.push({ url, type: request.resourceType() });
    }
  } catch {
    externalRequests.push({ url, type: request.resourceType() });
  }
});

await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SUBPATH });

const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));

const sel = (id) => `[data-testid="${id}"]`;
const text = async (id) => ((await page.textContent(sel(id))) ?? '').trim();

/* ── 테스트 자산 생성 ── */
async function canvasJpeg(width, height, label) {
  const base64 = await page.evaluate(
    ({ width, height, label }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#1e3a8a');
      grad.addColorStop(0.5, '#f97316');
      grad.addColorStop(1, '#065f46');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < image.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 70;
        image.data[i] = Math.max(0, Math.min(255, image.data[i] + noise));
        image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + noise));
        image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + noise));
      }
      ctx.putImageData(image, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `bold ${Math.round(width / 16)}px sans-serif`;
      ctx.fillText(label, Math.round(width * 0.07), Math.round(height * 0.54));
      for (let i = 0; i < 60; i += 1) {
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, 20 + Math.random() * 80, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.floor(Math.random() * 255)},${Math.floor(Math.random() * 255)},${Math.floor(
          Math.random() * 255,
        )},0.5)`;
        ctx.fill();
      }
      return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    },
    { width, height, label },
  );
  return Buffer.from(base64, 'base64');
}

async function canvasPng(width, height, label) {
  const base64 = await page.evaluate(
    ({ width, height, label }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0ea5e9');
      grad.addColorStop(1, '#a855f7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(width / 12)}px sans-serif`;
      ctx.fillText(label, Math.round(width * 0.1), Math.round(height * 0.55));
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { width, height, label },
  );
  return Buffer.from(base64, 'base64');
}

async function logoPng() {
  const base64 = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // 투명 배경 + 반투명 흰 사각형 + 진한 글자
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 18);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('MYLOGO', 18, 54);
    return canvas.toDataURL('image/png').split(',')[1];
  }, LOGO);
  return Buffer.from(base64, 'base64');
}

/** GPS·카메라·촬영일시가 심어진 실제 JPEG */
function withExif(jpegBuffer) {
  const exif = {
    '0th': {
      [piexif.ImageIFD.Make]: 'PocketCam',
      [piexif.ImageIFD.Model]: 'PC-2026',
      [piexif.ImageIFD.Software]: 'Pocket Tools Test',
      [piexif.ImageIFD.Orientation]: 1,
    },
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2026:11:20 15:04:05' },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [
        [37, 1],
        [34, 1],
        [12, 1],
      ],
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: [
        [126, 1],
        [58, 1],
        [41, 1],
      ],
    },
    '1st': {},
    thumbnail: null,
  };
  const binary = piexif.insert(piexif.dump(exif), jpegBuffer.toString('binary'));
  return Buffer.from(binary, 'binary');
}

/** 구조가 유효하지만 /Encrypt 가 걸린 PDF (pdf.js가 PasswordException을 던지는지 확인용) */
function buildEncryptedPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 5 0 R /Resources << >> >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${'AB'.repeat(32)}> /U <${'CD'.repeat(32)}> /P -44 >>`,
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let out = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 4 0 R /ID [<00112233445566778899AABBCCDDEEFF> <00112233445566778899AABBCCDDEEFF>] >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function makeFixtures() {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  writeFileSync(join(fixtureDir, 'test-photo.jpg'), await canvasJpeg(PHOTO.width, PHOTO.height, 'POCKET TOOLS TEST'));
  writeFileSync(join(fixtureDir, 'test-graphic.png'), await canvasPng(GRAPHIC.width, GRAPHIC.height, 'PNG 테스트'));
  writeFileSync(join(fixtureDir, 'photo-2.png'), await canvasPng(PHOTO2.width, PHOTO2.height, 'PHOTO 2'));
  writeFileSync(join(fixtureDir, 'logo.png'), await logoPng());
  writeFileSync(join(fixtureDir, 'exif-photo.jpg'), withExif(await canvasJpeg(EXIF_PHOTO.width, EXIF_PHOTO.height, 'EXIF TEST PHOTO')));
  writeFileSync(join(fixtureDir, 'memo.txt'), '이 파일은 이미지가 아닙니다.\n테스트용 텍스트 파일.', 'utf8');
  const pdfHeader = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  writeFileSync(join(fixtureDir, 'document.pdf'), pdfHeader, 'latin1');
  writeFileSync(join(fixtureDir, 'encrypted.pdf'), buildEncryptedPdf());
  writeFileSync(join(fixtureDir, 'broken.jpg'), randomBytes(4096));
}

function fileSize(file) {
  return statSync(join(fixtureDir, file)).size;
}

function pngDimensions(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
// PNG IHDR·JPEG SOF에서 오는 파일 구조 정보는 프라이버시 메타데이터가 아니다.
const STRUCTURAL_TAGS = new Set(['ImageWidth', 'ImageHeight', 'BitDepth', 'ColorType', 'Compression', 'Filter', 'Interlace']);
function privacyTags(parsed) {
  return parsed ? Object.keys(parsed).filter((key) => !STRUCTURAL_TAGS.has(key)) : [];
}

/** 다운로드 파일을 브라우저에서 실제로 디코딩해 크기를 확인한다(모든 이미지 형식 대응) */
async function imageInfo(filePath) {
  const mime = MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'image/png';
  const base64 = readFileSync(filePath).toString('base64');
  return page.evaluate(
    async ({ base64, mime }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${base64}`;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    },
    { base64, mime },
  );
}

/** 두 이미지의 픽셀 차이를 영역 안/밖으로 나눠 센다 */
async function pixelDiff(pathA, pathB, region, threshold = 0) {
  const mimeA = MIME_BY_EXT[extname(pathA).toLowerCase()] ?? 'image/png';
  const mimeB = MIME_BY_EXT[extname(pathB).toLowerCase()] ?? 'image/png';
  const a = readFileSync(pathA).toString('base64');
  const b = readFileSync(pathB).toString('base64');
  return page.evaluate(
    async ({ a, b, mimeA, mimeB, region, threshold }) => {
      const load = async (base64, mime) => {
        const img = new Image();
        img.src = `data:${mime};base64,${base64}`;
        await img.decode();
        return img;
      };
      const [imgA, imgB] = await Promise.all([load(a, mimeA), load(b, mimeB)]);
      if (imgA.naturalWidth !== imgB.naturalWidth || imgA.naturalHeight !== imgB.naturalHeight) {
        return { sizeMismatch: true, a: [imgA.naturalWidth, imgA.naturalHeight], b: [imgB.naturalWidth, imgB.naturalHeight] };
      }
      const width = imgA.naturalWidth;
      const height = imgA.naturalHeight;
      const canvasA = document.createElement('canvas');
      canvasA.width = width;
      canvasA.height = height;
      const ctxA = canvasA.getContext('2d');
      ctxA.drawImage(imgA, 0, 0);
      const dataA = ctxA.getImageData(0, 0, width, height).data;
      const canvasB = document.createElement('canvas');
      canvasB.width = width;
      canvasB.height = height;
      const ctxB = canvasB.getContext('2d');
      ctxB.drawImage(imgB, 0, 0);
      const dataB = ctxB.getImageData(0, 0, width, height).data;

      const x0 = Math.round(region.x * width);
      const y0 = Math.round(region.y * height);
      const x1 = Math.round((region.x + region.w) * width);
      const y1 = Math.round((region.y + region.h) * height);
      let insideDiff = 0;
      let insideTotal = 0;
      let outsideDiff = 0;
      let outsideTotal = 0;
      let maxDelta = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const delta =
            (Math.abs(dataA[i] - dataB[i]) + Math.abs(dataA[i + 1] - dataB[i + 1]) + Math.abs(dataA[i + 2] - dataB[i + 2])) / 3;
          if (delta > maxDelta) maxDelta = delta;
          const inRegion = x >= x0 && x < x1 && y >= y0 && y < y1;
          if (inRegion) {
            insideTotal += 1;
            if (delta > threshold) insideDiff += 1;
          } else {
            outsideTotal += 1;
            if (delta > threshold) outsideDiff += 1;
          }
        }
      }
      return { insideDiff, insideTotal, outsideDiff, outsideTotal, maxDelta: Math.round(maxDelta * 10) / 10 };
    },
    { a, b, mimeA, mimeB, region, threshold },
  );
}

async function samplePixel(filePath, x = 3, y = 3) {
  const mime = MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'image/png';
  const base64 = readFileSync(filePath).toString('base64');
  return page.evaluate(
    async ({ base64, mime, x, y }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${base64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    },
    { base64, mime, x, y },
  );
}

async function canvasPixels(selector) {
  const raw = await page.evaluate((cssSelector) => {
    const canvas = document.querySelector(cssSelector);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
    }
    return { width: canvas.width, height: canvas.height, base64: btoa(binary) };
  }, selector);
  if (!raw) return null;
  const buffer = Buffer.from(raw.base64, 'base64');
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.length) };
}

async function decodePngFileInPage(filePath) {
  const base64 = readFileSync(filePath).toString('base64');
  const raw = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
    }
    return { width: canvas.width, height: canvas.height, base64: btoa(binary) };
  }, base64);
  const buffer = Buffer.from(raw.base64, 'base64');
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.length) };
}

function decodeQr(pixels) {
  const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
  return result ? result.data : null;
}

async function downloadVia(selector, target) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.click(selector)]);
  await download.saveAs(target);
  return { name: download.suggestedFilename(), path: target, size: statSync(target).size };
}

async function fullPageShot(path) {
  await page.screenshot({ path, fullPage: true });
}

async function noHorizontalScroll(label) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  const ok = metrics.scrollWidth <= metrics.clientWidth && metrics.bodyScrollWidth <= metrics.clientWidth;
  return { ok, detail: `${label}: scrollWidth ${metrics.scrollWidth} ≤ clientWidth ${metrics.clientWidth} (body ${metrics.bodyScrollWidth})` };
}

await makeFixtures();

/* ── 0. 로드·PWA 기본 ── */
await run({ group: '기본', title: '첫 로드(App Shell) · 도구 7개' }, async () => {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  const title = await page.title();
  const h1 = await page.textContent('h1');
  const tabs = await page.locator('[role="tab"]').count();
  const labels = await page.locator('[role="tab"]').evaluateAll((nodes) => nodes.map((node) => (node.textContent || '').trim()));
  const ok = title.includes('Pocket Tools') && h1?.trim() === 'Pocket Tools' && tabs === 7 && labels.every(Boolean);
  await page.waitForTimeout(400);
  return { ok, detail: `title="${title}", h1="${h1?.trim()}", 탭 ${tabs}개: ${labels.join(' / ')}` };
});

await run({ group: '기본', title: '390×844 가로 스크롤 0' }, () => noHorizontalScroll('초기 화면'));

await run({ group: '기본', title: '탭 7개가 잘리지 않고 배치된다' }, async () => {
  const report = await page.locator('[role="tab"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const label = node.querySelector('.tool-tab-label');
      return {
        label: (node.textContent || '').trim(),
        width: Math.round(rect.width),
        right: Math.round(rect.right),
        clipped: label ? label.scrollWidth > label.clientWidth + 1 : false,
      };
    }),
  );
  const ok = report.every((item) => item.right <= 390 && item.width >= 60 && !item.clipped);
  return { ok, detail: report.map((item) => `${item.label}:${item.width}px`).join(' ') };
});

await run({ group: '기본', title: 'manifest·아이콘·Service Worker 연결' }, async () => {
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return { ok: false, reason: 'manifest 링크 없음' };
    const res = await fetch(link.href);
    const json = await res.json();
    return { ok: res.ok, name: json.name, icons: json.icons?.length ?? 0, display: json.display, start: json.start_url };
  });
  const icons = await page.evaluate(async () => {
    const sizes = [];
    for (const src of ['./icons/icon-192.png', './icons/icon-512.png', './pdfjs/pdf.worker.min.mjs']) {
      const res = await fetch(new URL(src, document.baseURI).href);
      const blob = await res.blob();
      sizes.push(`${src}:${res.status}/${blob.size}B`);
    }
    return sizes;
  });
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const names = await caches.keys();
    return { supported: true, scope: reg?.scope ?? null, active: Boolean(reg?.active), caches: names };
  });
  const ok = manifest.ok && manifest.icons >= 3 && sw.active === true && icons.every((line) => line.includes(':200/'));
  return { ok, detail: `manifest "${manifest.name}" · 아이콘/워커 ${icons.join(' ')} · SW ${sw.scope} · 캐시 ${sw.caches.join(',')}` };
});

/* ── 1. URL 도구 (1차 회귀) ── */
await run({ group: 'URL', title: '예시 URL 추적 파라미터 제거' }, async () => {
  await page.click(sel('tab-url'));
  await page.click(sel('url-example-button'));
  await page.waitForSelector(sel('url-summary'));
  const summary = (await page.textContent(sel('url-summary'))) ?? '';
  const cleaned = (await page.textContent(sel('url-cleaned'))) ?? '';
  const chips = await page.locator(`${sel('url-removed-list')} li`).count();
  const ok = summary.includes('추적 파라미터') && cleaned === 'https://shop.example.com/item/4821?id=4821&page=2#review' && chips === 5;
  return { ok, detail: `요약="${summary.trim()}", 제거 칩 ${chips}개, 결과="${cleaned}"` };
});

await run({ group: 'URL', title: '서명 URL: X-Amz-* 보존 · utm 제거' }, async () => {
  await page.click(sel('url-signed-example-button'));
  await page.waitForTimeout(100);
  const cleaned = (await page.textContent(sel('url-cleaned'))) ?? '';
  const summary = (await page.textContent(sel('url-summary'))) ?? '';
  const keepsSignature = ['X-Amz-Signature', 'X-Amz-Credential', 'X-Amz-Expires', 'X-Amz-Date'].every((key) => cleaned.includes(key));
  const removedTracking = !cleaned.includes('utm_source') && !cleaned.includes('utm_campaign');
  const ok = keepsSignature && removedTracking && summary.includes('2개');
  return { ok, detail: `서명 보존=${keepsSignature}, 추적 제거=${removedTracking}, 요약="${summary.trim()}"` };
});

await run({ group: 'URL', title: '잘못된 URL 한글 오류 안내' }, async () => {
  await page.fill(sel('url-input'), 'https://');
  await page.click(sel('url-clean-button'));
  const parseError = (await page.textContent(sel('url-error'))) ?? '';
  await page.fill(sel('url-input'), 'abc');
  await page.click(sel('url-clean-button'));
  const domainError = (await page.textContent(sel('url-error'))) ?? '';
  const ok = parseError.includes('올바른 URL이 아닙니다') && domainError.includes('도메인');
  return { ok, detail: `파싱 오류="${parseError.trim()}" / 도메인 오류="${domainError.trim()}"` };
});

await run({ group: 'URL', title: '원클릭 복사 → 클립보드 일치' }, async () => {
  await page.click(sel('url-example-button'));
  await page.waitForSelector(sel('url-copy-button'));
  await page.click(sel('url-copy-button'));
  await page.waitForTimeout(250);
  const expected = (await page.textContent(sel('url-cleaned'))) ?? '';
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  const ok = clipboard === expected && expected.includes('id=4821');
  return { ok, detail: `클립보드="${clipboard.slice(0, 80)}"` };
});

await run({ group: 'URL', title: '결과 화면 가로 스크롤 0' }, () => noHorizontalScroll('URL 결과'));

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
await page.screenshot({ path: join(shotDir, '01-url-result.png') });
await fullPageShot(join(shotDir, '01-url-full.png'));

/* ── 2. 이미지 압축 (1차 회귀) ── */
await page.click(sel('tab-image'));
await page.waitForSelector(sel('image-dropzone'));

await run({ group: '이미지', title: 'JPG 업로드 → 실제 압축·용량 감소' }, async () => {
  await page.setInputFiles(sel('image-input'), join(fixtureDir, 'test-photo.jpg'));
  await page.waitForSelector(sel('size-after'), { timeout: 20000 });
  await page.waitForTimeout(300);
  const beforeText = await text('size-before');
  const afterText = await text('size-after');
  const savings = await text('size-savings');
  const meta = await text('image-result-meta');
  const preview = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="image-preview"]');
    return img ? { w: img.naturalWidth, h: img.naturalHeight, src: img.src.slice(0, 12) } : null;
  });
  const okPercent = savings.startsWith('-') && parseFloat(savings.replace(/[^0-9.]/g, '')) > 10;
  const previewOk = Boolean(preview && preview.w === PHOTO.width && preview.h === PHOTO.height && preview.src.startsWith('blob:'));
  const ok = beforeText !== afterText && okPercent && previewOk;
  return {
    ok,
    detail: `원본 ${beforeText}(${fileSize('test-photo.jpg')}B) → 결과 ${afterText}, 절감 ${savings}, 미리보기 ${preview?.w}×${preview?.h}, ${meta}`,
  };
});

await run({ group: '이미지', title: '결과 파일 실제 다운로드' }, async () => {
  const file = await downloadVia(sel('image-download'), join(dlDir, 'downloaded-image.jpg'));
  const ok = file.size > 1000 && file.name.includes('압축');
  return { ok, detail: `파일 ${file.name}, ${file.size}B 저장` };
});

await run({ group: '이미지', title: 'WebP 변환 → 형식 전환 확인' }, async () => {
  await page.click(sel('format-webp'));
  await page.waitForTimeout(700);
  const meta = await text('image-result-meta');
  const ok = meta.includes('WebP');
  return { ok, detail: `${meta} (결과 ${await text('size-after')})` };
});

await run({ group: '이미지', title: '품질 10% → 용량 추가 감소' }, async () => {
  await page.locator(sel('quality-range')).fill('10');
  await page.waitForTimeout(900);
  const savings = await text('size-savings');
  const ok = savings.startsWith('-') && parseFloat(savings.replace(/[^0-9.]/g, '')) > 40;
  return { ok, detail: `절감 ${savings}, 결과 ${await text('size-after')}` };
});

await run({ group: '이미지', title: '텍스트 파일 업로드 → 한글 오류' }, async () => {
  await page.setInputFiles(sel('image-input'), join(fixtureDir, 'memo.txt'));
  await page.waitForSelector(sel('image-error'));
  const message = await text('image-error');
  const ok = message.includes('지원하지 않는 파일') && message.includes('.txt');
  return { ok, detail: message };
});

await run({ group: '이미지', title: '손상 파일 업로드 → 읽기 실패 안내' }, async () => {
  await page.setInputFiles(sel('image-input'), join(fixtureDir, 'broken.jpg'));
  await page.waitForFunction(
    () => {
      const node = document.querySelector('[data-testid="image-error"]');
      return Boolean(node && node.textContent && node.textContent.includes('읽을 수 없습니다'));
    },
    undefined,
    { timeout: 15000 },
  );
  return { ok: (await text('image-error')).includes('읽을 수 없습니다'), detail: await text('image-error') };
});

await run({ group: '이미지', title: 'PNG 업로드 후 압축 결과 표시(원본 형식 유지)' }, async () => {
  await page.click(sel('format-original'));
  await page.waitForTimeout(300);
  await page.setInputFiles(sel('image-input'), join(fixtureDir, 'test-graphic.png'));
  await page.waitForTimeout(1400);
  const meta = await text('image-result-meta');
  const ok = (await text('size-after')).length > 0 && meta.includes('PNG');
  return { ok, detail: `결과 ${await text('size-after')}, ${meta}` };
});

await run({ group: '이미지', title: '결과 화면 가로 스크롤 0' }, () => noHorizontalScroll('이미지 결과'));

await page.locator(sel('image-result')).scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(shotDir, '02-image-compressed.png') });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(150);
await fullPageShot(join(shotDir, '02-image-full.png'));

/* ── 3. QR (1차 회귀) ── */
await page.click(sel('tab-qr'));
await page.waitForSelector(sel('qr-input'));
const QR_TEXT = 'https://example.com/pocket-tools?from=qr&검증=한글';

await run({ group: 'QR', title: '빈 입력 오류 안내' }, async () => {
  await page.click(sel('qr-generate-button'));
  await page.waitForSelector(sel('qr-error'));
  const message = await text('qr-error');
  return { ok: message.includes('입력해 주세요'), detail: message };
});

await run({ group: 'QR', title: 'QR 생성 → jsQR 실디코딩 100% 일치' }, async () => {
  await page.fill(sel('qr-input'), QR_TEXT);
  await page.click(sel('qr-generate-button'));
  await page.waitForSelector(`${sel('qr-canvas')}:not(.qr-canvas-hidden)`, { timeout: 10000 });
  await page.waitForTimeout(300);
  const pixels = await canvasPixels('#qr-canvas');
  if (!pixels) throw new Error('캔버스를 찾지 못함');
  const decoded = decodeQr(pixels);
  return { ok: decoded === QR_TEXT, detail: `캔버스 ${pixels.width}×${pixels.height}, 디코드 ${decoded === QR_TEXT ? '원문 일치' : `불일치(${decoded})`}` };
});

await run({ group: 'QR', title: 'QR PNG 다운로드 → 파일 디코딩 일치' }, async () => {
  const file = await downloadVia(sel('qr-download'), join(dlDir, 'downloaded-qr.png'));
  const buffer = readFileSync(file.path);
  const signatureOk = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const dims = pngDimensions(buffer);
  const decoded = decodeQr(await decodePngFileInPage(file.path));
  const ok = signatureOk && dims.width === 1024 && dims.height === 1024 && decoded === QR_TEXT;
  return { ok, detail: `${file.name} · PNG 서명=${signatureOk} · ${dims.width}×${dims.height} · ${buffer.length}B · 디코드 ${decoded === QR_TEXT ? '일치' : `불일치(${decoded})`}` };
});

await run({ group: 'QR', title: '이미지 복사 (또는 fallback 안내)' }, async () => {
  await page.click(sel('qr-copy-button'));
  await page.waitForTimeout(600);
  const status = await text('qr-status');
  const ok = status.includes('복사했습니다') || status.includes('지원하지 않습니다');
  return { ok, detail: `상태="${status}"` };
});

await run({ group: 'QR', title: '내용 수정 시 자동 갱신 + 디코딩 일치' }, async () => {
  const next = 'Pocket Tools QR 자동 갱신 테스트 12345';
  await page.fill(sel('qr-input'), next);
  await page.waitForTimeout(900);
  const decoded = decodeQr(await canvasPixels('#qr-canvas'));
  return { ok: decoded === next, detail: decoded === next ? '갱신된 QR 디코딩 일치' : `불일치(${decoded})` };
});

await page.locator(sel('qr-canvas')).scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(shotDir, '03-qr.png') });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(150);
await fullPageShot(join(shotDir, '03-qr-full.png'));

/* ── 4. ④ 사진 비율 조정 ── */
await page.click(sel('tab-ratio'));
await page.waitForSelector(sel('ratio-dropzone'));

await run({ group: '④ 비율', title: 'JPG 1:1 여백 추가 → 1600×1600 실제 생성·다운로드' }, async () => {
  await page.setInputFiles(sel('ratio-input'), join(fixtureDir, 'test-photo.jpg'));
  await page.waitForSelector(sel('ratio-result'), { timeout: 20000 });
  await page.waitForTimeout(300);
  const before = await text('ratio-dims-before');
  const after = await text('ratio-dims-after');
  const check = await text('ratio-check');
  const file = await downloadVia(sel('ratio-download'), join(dlDir, 'ratio-1x1.png'));
  const dims = pngDimensions(readFileSync(file.path));
  const ok = before === '1600×1200' && after === '1600×1600' && dims.width === 1600 && dims.height === 1600 && check.includes('1:1 일치');
  return { ok, detail: `${before} → ${after} (표시), 파일 ${file.name} ${dims.width}×${dims.height} ${file.size}B, ${check}` };
});

await run({ group: '④ 비율', title: '9:16 여백 추가 → 900×1600 (비율 0.5625)' }, async () => {
  await page.click(sel('ratio-opt-9x16'));
  await page.waitForTimeout(600);
  const after = await text('ratio-dims-after');
  const file = await downloadVia(sel('ratio-download'), join(dlDir, 'ratio-9x16.png'));
  const dims = pngDimensions(readFileSync(file.path));
  const ratio = dims.width / dims.height;
  const ok = after === '900×1600' && Math.abs(ratio - 9 / 16) < 0.001;
  return { ok, detail: `${after}, 파일 ${dims.width}×${dims.height} 비율 ${ratio.toFixed(4)}` };
});

await run({ group: '④ 비율', title: '16:9 꽉 채우기(중앙 크롭) → 1600×900' }, async () => {
  await page.click(sel('ratio-opt-16x9'));
  await page.click(sel('ratio-mode-crop'));
  await page.waitForTimeout(600);
  const after = await text('ratio-dims-after');
  const file = await downloadVia(sel('ratio-download'), join(dlDir, 'ratio-16x9-crop.png'));
  const dims = pngDimensions(readFileSync(file.path));
  // 크롭이므로 4:3 원본을 16:9로 자른 결과에는 여백이 없어야 한다(모서리 픽셀이 검정이 아님)
  const [r, g, b] = await samplePixel(file.path, 4, 4);
  const ok = after === '1600×900' && dims.width === 1600 && dims.height === 900 && r + g + b > 20;
  return { ok, detail: `${after}, 파일 ${dims.width}×${dims.height}, 모서리 rgb(${r},${g},${b})` };
});

await run({ group: '④ 비율', title: '여백 배경: 검정 vs 흐린 원본 구분' }, async () => {
  await page.click(sel('ratio-opt-1x1'));
  await page.click(sel('ratio-mode-pad'));
  await page.click(sel('ratio-bg-black'));
  await page.waitForTimeout(600);
  const blackFile = await downloadVia(sel('ratio-download'), join(dlDir, 'ratio-bg-black.png'));
  const black = await samplePixel(blackFile.path, 4, 4);
  await page.click(sel('ratio-bg-blur'));
  await page.waitForTimeout(700);
  const blurFile = await downloadVia(sel('ratio-download'), join(dlDir, 'ratio-bg-blur.png'));
  const blur = await samplePixel(blurFile.path, 4, 4);
  const ok = black[0] + black[1] + black[2] < 12 && blur[0] + blur[1] + blur[2] > 40;
  return { ok, detail: `검정 여백 rgb(${black.slice(0, 3)}) / 흐린 여백 rgb(${blur.slice(0, 3)})` };
});

await run({ group: '④ 비율', title: 'WebP 출력·전후 해상도·용량 표시' }, async () => {
  await page.click(sel('ratio-format-webp'));
  await page.waitForTimeout(700);
  const file = await downloadVia(sel('ratio-download'), join(dlDir, 'ratio.webp'));
  const buffer = readFileSync(file.path);
  const riff = buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP';
  const dims = await imageInfo(file.path);
  const before = await text('ratio-size-before');
  const after = await text('ratio-size-after');
  const ok = riff && dims.width === 1600 && dims.height === 1600 && before.length > 0 && after.length > 0;
  return { ok, detail: `${file.name} ${file.size}B ${dims.width}×${dims.height}, 용량 ${before} → ${after}` };
});

await page.locator(sel('ratio-result')).scrollIntoViewIfNeeded().catch(() => {});
await page.evaluate(() => window.scrollBy(0, -80));
await page.waitForTimeout(250);
await page.screenshot({ path: join(shotDir, '04-ratio.png') });

await run({ group: '④ 비율', title: '잘못된 파일(.txt) 업로드 오류 안내' }, async () => {
  await page.setInputFiles(sel('ratio-input'), join(fixtureDir, 'memo.txt'));
  await page.waitForSelector(sel('ratio-error'));
  const message = await text('ratio-error');
  return { ok: message.includes('지원하지 않는 파일'), detail: message };
});

/* ── 5. ⑤ PDF ↔ 이미지 ── */
await page.click(sel('tab-pdf'));
await page.waitForSelector(sel('pdf-mode-to-pdf'));
await page.click(sel('pdf-mode-to-pdf'));
await page.waitForSelector(sel('pdfimg-dropzone'));

const PDF_PATH = join(dlDir, 'built-images.pdf');

await run({ group: '⑤ PDF', title: '이미지 3장 추가 → 순서 목록 표시' }, async () => {
  await page.setInputFiles(sel('pdfimg-input'), [
    join(fixtureDir, 'photo-2.png'),
    join(fixtureDir, 'test-photo.jpg'),
    join(fixtureDir, 'test-graphic.png'),
  ]);
  await page.waitForSelector(sel('pdfimg-row-2'), { timeout: 20000 });
  const count = await text('pdfimg-count');
  const first = await page.textContent(sel('pdfimg-name-0'));
  const ok = count.includes('3') && (first ?? '').includes('photo-2.png');
  return { ok, detail: `${count}, 1번째=${(first ?? '').trim().split('\n')[0]}` };
});

await run({ group: '⑤ PDF', title: '위로 이동 → 페이지 순서 변경' }, async () => {
  await page.click(sel('pdfimg-move-up-1'));
  await page.waitForTimeout(200);
  const first = await page.textContent(sel('pdfimg-name-0'));
  const second = await page.textContent(sel('pdfimg-name-1'));
  const ok = (first ?? '').includes('test-photo.jpg') && (second ?? '').includes('photo-2.png');
  return { ok, detail: `1번째=${(first ?? '').split('\n')[0]}, 2번째=${(second ?? '').split('\n')[0]}` };
});

await run({ group: '⑤ PDF', title: '3번째 페이지 삭제 → 2장' }, async () => {
  await page.click(sel('pdfimg-remove-2'));
  await page.waitForTimeout(200);
  const count = await text('pdfimg-count');
  const rows = await page.locator(`${sel('pdfimg-list')} li`).count();
  const ok = count.includes('2') && rows === 2;
  return { ok, detail: `${count}, 목록 ${rows}개` };
});

await run({ group: '⑤ PDF', title: 'PDF 생성·다운로드 → 페이지 수/페이지 크기 검증' }, async () => {
  await page.click(sel('pdfimg-mode-image'));
  await page.click(sel('pdfimg-generate'));
  await page.waitForSelector(sel('pdfimg-result'), { timeout: 30000 });
  const pageCount = await text('pdfimg-page-count');
  const file = await downloadVia(sel('pdfimg-download'), PDF_PATH);
  const bytes = readFileSync(file.path);
  const magic = bytes.subarray(0, 5).toString('latin1');
  const doc = await PDFDocument.load(bytes);
  const sizes = doc.getPages().map((p) => p.getSize());
  const ok =
    magic === '%PDF-' &&
    doc.getPageCount() === 2 &&
    Math.round(sizes[0].width) === PHOTO.width &&
    Math.round(sizes[0].height) === PHOTO.height &&
    Math.round(sizes[1].width) === PHOTO2.width &&
    Math.round(sizes[1].height) === PHOTO2.height &&
    pageCount.includes('2페이지');
  return {
    ok,
    detail: `${file.name} ${file.size}B, ${magic}, ${doc.getPageCount()}페이지, 1쪽 ${Math.round(sizes[0].width)}×${Math.round(
      sizes[0].height,
    )}, 2쪽 ${Math.round(sizes[1].width)}×${Math.round(sizes[1].height)}`,
  };
});

await run({ group: '⑤ PDF', title: 'PDF → 이미지: 2페이지 실제 렌더링' }, async () => {
  await page.click(sel('pdf-mode-to-image'));
  await page.waitForSelector(sel('pdf-dropzone'));
  await page.setInputFiles(sel('pdf-input'), PDF_PATH);
  await page.waitForSelector(sel('pdf-page-2'), { timeout: 60000 });
  const info = await text('pdf-page-count');
  const pages = await page.locator(`${sel('pdf-results')} figure`).count();
  const previewSrc = await page.getAttribute(`${sel('pdf-page-1')} img`, 'src');
  const ok = info.includes('2페이지') && pages === 2 && Boolean(previewSrc?.startsWith('blob:'));
  return { ok, detail: `${info} · 미리보기 ${pages}개 · ${previewSrc?.slice(0, 12)}` };
});

await run({ group: '⑤ PDF', title: '페이지 1 이미지 다운로드 → 실제 PNG 1240×930' }, async () => {
  const file = await downloadVia(sel('pdf-page-download-1'), join(dlDir, 'pdf-page-1.png'));
  const buffer = readFileSync(file.path);
  const signatureOk = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const dims = pngDimensions(buffer);
  const ok = signatureOk && dims.width === 1240 && dims.height === 930;
  return { ok, detail: `${file.name} ${file.size}B, PNG 서명=${signatureOk}, ${dims.width}×${dims.height}` };
});

await run({ group: '⑤ PDF', title: '전체 ZIP 다운로드 → 2개 항목' }, async () => {
  const file = await downloadVia(sel('pdf-download-all'), join(dlDir, 'pdf-pages.zip'));
  const zip = await JSZip.loadAsync(readFileSync(file.path));
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const first = await zip.file(names[0])?.async('uint8array');
  const ok = names.length === 2 && Boolean(first && first.length > 1000) && names[0].startsWith('page-001');
  return { ok, detail: `${file.name} ${file.size}B, 항목 ${names.join(', ')}` };
});

await page.locator(sel('pdf-results')).scrollIntoViewIfNeeded().catch(() => {});
await page.evaluate(() => window.scrollBy(0, -120));
await page.waitForTimeout(250);
await page.screenshot({ path: join(shotDir, '05-pdf.png') });

await run({ group: '⑤ PDF', title: 'JPEG 형식으로 다시 변환·다운로드' }, async () => {
  await page.click(sel('pdf-format-jpeg'));
  await page.waitForFunction(
    () => {
      const node = document.querySelector('[data-testid="pdf-page-count"]');
      return Boolean(node && /JPEG/.test(node.textContent || ''));
    },
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(300);
  const meta = await text('pdf-page-count');
  const file = await downloadVia(sel('pdf-page-download-1'), join(dlDir, 'pdf-page-1.jpg'));
  const bytes = readFileSync(file.path);
  const jpegMagic = bytes[0] === 0xff && bytes[1] === 0xd8;
  const dims = await imageInfo(file.path);
  const ok = jpegMagic && meta.includes('JPEG') && dims.width === 1240 && dims.height === 930;
  return { ok, detail: `${file.name} ${file.size}B ${dims.width}×${dims.height} · JPEG 매직=${jpegMagic} · ${meta}` };
});

await run({ group: '⑤ PDF', title: '잘못된 파일(.txt) 업로드 오류 안내' }, async () => {
  await page.setInputFiles(sel('pdf-input'), join(fixtureDir, 'memo.txt'));
  await page.waitForSelector(sel('pdf-error'));
  const message = await text('pdf-error');
  return { ok: message.includes('PDF 파일만 선택할 수 있습니다'), detail: message };
});

await run({ group: '⑤ PDF', title: '암호화 PDF 오류 안내' }, async () => {
  await page.setInputFiles(sel('pdf-input'), join(fixtureDir, 'encrypted.pdf'));
  await page.waitForFunction(
    () => {
      const node = document.querySelector('[data-testid="pdf-error"]');
      return Boolean(node && /암호|비밀번호|손상/.test(node.textContent || ''));
    },
    undefined,
    { timeout: 30000 },
  );
  const message = await text('pdf-error');
  return { ok: message.includes('암호') || message.includes('비밀번호'), detail: message };
});

/* ── 6. ⑥ EXIF 제거 · 모자이크 ── */
await page.click(sel('tab-exif'));
await page.waitForSelector(sel('exif-dropzone'));

const EXIF_OUT_PNG = join(dlDir, 'exif-mosaic.png');
const EXIF_OUT_JPG = join(dlDir, 'exif-mosaic.jpg');

await run({ group: '⑥ EXIF', title: '실제 EXIF(GPS·카메라·촬영일시) 검출' }, async () => {
  await page.setInputFiles(sel('exif-input'), join(fixtureDir, 'exif-photo.jpg'));
  await page.waitForSelector(sel('exif-info'), { timeout: 20000 });
  await page.waitForTimeout(400);
  const summary = await text('exif-summary');
  const gps = await text('exif-gps');
  const camera = await text('exif-camera');
  const date = await text('exif-date');
  const tags = await page.locator(`${sel('exif-tags')} li`).count();
  const ok = gps.includes('37.57') && gps.includes('N') && camera.includes('PocketCam') && date.includes('2026-11-20') && tags >= 5;
  return { ok, detail: `${summary} · GPS=${gps} · 카메라=${camera} · 촬영=${date} · 태그 ${tags}개` };
});

await run({ group: '⑥ EXIF', title: '마우스 드래그로 모자이크 영역 1개 지정' }, async () => {
  await page.locator(sel('exif-canvas')).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await page.locator(sel('exif-canvas')).boundingBox();
  if (!box) throw new Error('캔버스 없음');
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const count = await text('exif-region-count');
  return { ok: count.includes('1'), detail: `영역 ${count}` };
});

await run({ group: '⑥ EXIF', title: '터치(포인터) 드래그로 영역 추가 → 2개' }, async () => {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="exif-canvas"]');
    if (!canvas) return { ok: false, reason: 'canvas 없음' };
    const rect = canvas.getBoundingClientRect();
    const point = (nx, ny) => ({ clientX: rect.left + rect.width * nx, clientY: rect.top + rect.height * ny });
    const fire = (type, nx, ny, buttons) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 91,
          pointerType: 'touch',
          isPrimary: true,
          buttons,
          ...point(nx, ny),
        }),
      );
    fire('pointerdown', 0.6, 0.62, 1);
    fire('pointermove', 0.75, 0.72, 1);
    fire('pointermove', 0.9, 0.85, 1);
    fire('pointerup', 0.9, 0.85, 0);
    return { ok: true };
  });
  await page.waitForTimeout(250);
  const count = await text('exif-region-count');
  return { ok: result.ok && count.includes('2'), detail: `영역 ${count}` };
});

await run({ group: '⑥ EXIF', title: '되돌리기·전체 초기화 동작' }, async () => {
  await page.click(sel('exif-undo'));
  await page.waitForTimeout(150);
  const afterUndo = await text('exif-region-count');
  await page.click(sel('exif-clear'));
  await page.waitForTimeout(150);
  const afterClear = await text('exif-region-count');
  return { ok: afterUndo.includes('1') && afterClear.includes('0'), detail: `되돌리기 후 ${afterUndo}, 초기화 후 ${afterClear}` };
});

await run({ group: '⑥ EXIF', title: 'PNG 저장 → 결과 바이트 EXIF 0건 검증 표시' }, async () => {
  // 모자이크 영역을 다시 하나 지정한다
  await page.locator(sel('exif-canvas')).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await page.locator(sel('exif-canvas')).boundingBox();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  await page.click(sel('exif-format-png'));
  await page.click(sel('exif-save'));
  await page.waitForSelector(sel('exif-verify'), { timeout: 30000 });
  const summary = await text('exif-verify-summary');
  const lines = await page.locator(`${sel('exif-verify-lines')} li`).allTextContents();
  const ok = summary.includes('완전 제거') && summary.includes('EXIF 0건') && summary.includes('GPS 0건') && lines.length >= 3;
  return { ok, detail: `${summary} / ${lines[0]}` };
});

await run({ group: '⑥ EXIF', title: '다운로드 파일에서 EXIF·GPS 태그 0건 실측' }, async () => {
  const file = await downloadVia(sel('exif-download'), EXIF_OUT_PNG);
  const bytes = readFileSync(file.path);
  const parsed = await exifr.parse(bytes).catch(() => null);
  const marker = bytes.includes(Buffer.from('Exif\0\0', 'binary'));
  const tags = privacyTags(parsed);
  const gps = parsed && (parsed.latitude !== undefined || parsed.GPSLatitude !== undefined);
  const camera = tags.some((key) => ['Make', 'Model', 'LensModel', 'SerialNumber', 'BodySerialNumber'].includes(key));
  const ok = !marker && !gps && !camera && tags.length === 0;
  return { ok, detail: `${file.name} ${file.size}B · 'Exif' 마커=${marker} · 개인정보 태그=${tags.length} · GPS=${Boolean(gps)} · 카메라=${Boolean(camera)} (구조 태그 제외)` };
});

await run({ group: '⑥ EXIF', title: '모자이크 실제 픽셀 적용(영역 안 변화·밖 동일)' }, async () => {
  const diff = await pixelDiff(join(fixtureDir, 'exif-photo.jpg'), EXIF_OUT_PNG, { x: 0.15, y: 0.2, w: 0.35, h: 0.25 });
  const ok = !diff.sizeMismatch && diff.insideDiff > 1000 && diff.outsideDiff === 0 && diff.maxDelta > 20;
  return {
    ok,
    detail: `영역 안 변화 ${diff.insideDiff}/${diff.insideTotal}px · 영역 밖 변화 ${diff.outsideDiff}/${diff.outsideTotal}px · 최대 변화 ${diff.maxDelta}`,
  };
});

await run({ group: '⑥ EXIF', title: 'JPEG 저장도 EXIF 0건 (다운로드 실측)' }, async () => {
  await page.click(sel('exif-format-jpeg'));
  await page.click(sel('exif-save'));
  await page.waitForTimeout(500);
  await page.waitForSelector(sel('exif-verify'), { timeout: 30000 });
  const file = await downloadVia(sel('exif-download'), EXIF_OUT_JPG);
  const bytes = readFileSync(file.path);
  const parsed = await exifr.parse(bytes).catch(() => null);
  const marker = bytes.includes(Buffer.from('Exif\0\0', 'binary'));
  const jpegMagic = bytes[0] === 0xff && bytes[1] === 0xd8;
  const tags = privacyTags(parsed);
  const ok = jpegMagic && !marker && tags.length === 0;
  return { ok, detail: `${file.name} ${file.size}B · JPEG 매직=${jpegMagic} · Exif 마커=${marker} · 개인정보 태그 ${tags.length}` };
});

await page.locator(sel('exif-canvas')).scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
await page.screenshot({ path: join(shotDir, '06-exif-mosaic.png') });
await page.locator(sel('exif-verify')).scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(shotDir, '06-exif-verify.png') });

await run({ group: '⑥ EXIF', title: 'EXIF 없는 PNG 안내' }, async () => {
  await page.setInputFiles(sel('exif-input'), join(fixtureDir, 'test-graphic.png'));
  await page.waitForSelector(sel('exif-none'), { timeout: 20000 });
  const message = await text('exif-none');
  const ok = message.includes('EXIF') && message.includes('없습니다');
  return { ok, detail: message };
});

await run({ group: '⑥ EXIF', title: '잘못된 파일(.txt) 오류 안내' }, async () => {
  await page.setInputFiles(sel('exif-input'), join(fixtureDir, 'memo.txt'));
  await page.waitForSelector(sel('exif-error'));
  const message = await text('exif-error');
  return { ok: message.includes('지원하지 않는 파일'), detail: message };
});

/* ── 7. ⑦ 워터마크 ── */
await page.click(sel('tab-wm'));
await page.waitForSelector(sel('wm-dropzone'));

const WM_ZIP = join(dlDir, 'watermarks.zip');
const WM_FIRST = join(dlDir, 'watermark-1.jpg');
const WM_LOGO_OUT = join(dlDir, 'watermark-logo.jpg');

await run({ group: '⑦ 워터마크', title: '다중 이미지 2장 업로드 → 썸네일 표시' }, async () => {
  await page.setInputFiles(sel('wm-input'), [join(fixtureDir, 'test-photo.jpg'), join(fixtureDir, 'photo-2.png')]);
  await page.waitForSelector(sel('wm-thumb-1'), { timeout: 20000 });
  const count = await text('wm-count');
  const thumbs = await page.locator(`${sel('wm-list')} li`).count();
  const canvasVisible = await page.locator(sel('wm-canvas')).count();
  const ok = count.includes('2') && thumbs === 2 && canvasVisible === 1;
  return { ok, detail: `${count}, 썸네일 ${thumbs}개, 미리보기 캔버스 ${canvasVisible}` };
});

await run({ group: '⑦ 워터마크', title: '텍스트·투명도·위치 설정 후 일괄 적용' }, async () => {
  await page.fill(sel('wm-text'), 'POCKET TOOLS');
  await page.locator(sel('wm-opacity')).fill('60');
  await page.click(sel('wm-pos-tl'));
  await page.waitForTimeout(400);
  await page.click(sel('wm-apply'));
  await page.waitForSelector(sel('wm-result'), { timeout: 40000 });
  const status = await text('wm-status');
  const resultCount = await text('wm-result-count');
  const ok = status.includes('2장') && resultCount.includes('2장');
  return { ok, detail: `상태="${status}" · ${resultCount}` };
});

await run({ group: '⑦ 워터마크', title: 'ZIP 다운로드 → 2개 항목, 원본과 다른 바이트' }, async () => {
  const file = await downloadVia(sel('wm-download-all'), WM_ZIP);
  const zip = await JSZip.loadAsync(readFileSync(file.path));
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const originals = [readFileSync(join(fixtureDir, 'test-photo.jpg')), readFileSync(join(fixtureDir, 'photo-2.png'))];
  const entries = [];
  for (const name of names) {
    const data = Buffer.from(await zip.file(name).async('uint8array'));
    entries.push({
      name,
      size: data.length,
      differs: !originals.some((original) => original.length === data.length && original.equals(data)),
    });
  }
  const ok = entries.length === 2 && entries.every((entry) => entry.size > 1000 && entry.differs);
  return { ok, detail: `${file.name} ${file.size}B · ${entries.map((entry) => `${entry.name}(${entry.size}B,원본과다름=${entry.differs})`).join(', ')}` };
});

await run({ group: '⑦ 워터마크', title: '개별 다운로드 + 좌상단 워터마크 픽셀 확인' }, async () => {
  const file = await downloadVia(sel('wm-download-0'), WM_FIRST);
  const diff = await pixelDiff(join(fixtureDir, 'test-photo.jpg'), file.path, { x: 0, y: 0, w: 0.4, h: 0.18 }, 6);
  const bottom = await pixelDiff(join(fixtureDir, 'test-photo.jpg'), file.path, { x: 0, y: 0.7, w: 1, h: 0.3 }, 6);
  const ok = !diff.sizeMismatch && diff.insideDiff > 500 && diff.maxDelta > 20;
  return {
    ok,
    detail: `${file.name} ${file.size}B · 좌상단 변화 ${diff.insideDiff}px(최대 ${diff.maxDelta}) · 하단 변화 ${bottom.insideDiff}px`,
  };
});

await run({ group: '⑦ 워터마크', title: '로고 이미지 + 우하단 위치 일괄 적용' }, async () => {
  await page.click(sel('wm-kind-logo'));
  await page.setInputFiles(sel('wm-logo-input'), join(fixtureDir, 'logo.png'));
  await page.waitForFunction(
    () => {
      const node = document.querySelector('[data-testid="wm-logo-status"]');
      return Boolean(node && /logo\.png/.test(node.textContent || ''));
    },
    undefined,
    { timeout: 10000 },
  );
  await page.click(sel('wm-pos-br'));
  await page.locator(sel('wm-opacity')).fill('100');
  await page.waitForTimeout(300);
  await page.click(sel('wm-apply'));
  await page.waitForTimeout(300);
  await page.waitForFunction(
    () => {
      const node = document.querySelector('[data-testid="wm-status"]');
      return Boolean(node && /2장에 워터마크를 적용/.test(node.textContent || ''));
    },
    undefined,
    { timeout: 40000 },
  );
  const file = await downloadVia(sel('wm-download-0'), WM_LOGO_OUT);
  const diff = await pixelDiff(join(fixtureDir, 'test-photo.jpg'), file.path, { x: 0.55, y: 0.75, w: 0.45, h: 0.25 }, 6);
  const logoStatus = await text('wm-logo-status');
  const ok = !diff.sizeMismatch && diff.insideDiff > 500 && diff.maxDelta > 20;
  return { ok, detail: `${logoStatus} · 우하단 변화 ${diff.insideDiff}px(최대 ${diff.maxDelta}) · ${file.name} ${file.size}B` };
});

await run({ group: '⑦ 워터마크', title: '잘못된 파일(.txt) 오류 안내' }, async () => {
  await page.setInputFiles(sel('wm-input'), join(fixtureDir, 'memo.txt'));
  await page.waitForSelector(sel('wm-error'));
  const message = await text('wm-error');
  return { ok: message.includes('지원하지 않는 파일'), detail: message };
});

await page.locator(sel('wm-canvas')).scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
await page.screenshot({ path: join(shotDir, '07-watermark.png') });

/* ── 8. 안정성 ── */
await run({ group: '안정성', title: '새로고침 후 정상 동작(탭 복원 포함)' }, async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  const activeTab = await page.getAttribute('[role="tab"][aria-selected="true"]', 'data-testid');
  await page.click(sel('tab-url'));
  await page.click(sel('url-example-button'));
  await page.waitForSelector(sel('url-summary'));
  const cleaned = (await page.textContent(sel('url-cleaned'))) ?? '';
  await page.click(sel('tab-ratio'));
  await page.setInputFiles(sel('ratio-input'), join(fixtureDir, 'photo-2.png'));
  await page.waitForSelector(sel('ratio-result'), { timeout: 20000 });
  const dims = await text('ratio-dims-after');
  const ok = cleaned === 'https://shop.example.com/item/4821?id=4821&page=2#review' && activeTab === 'tab-wm' && dims.includes('600×600');
  return { ok, detail: `복원 탭=${activeTab}, URL 결과 정상, 비율 변환 ${dims}` };
});

await run({ group: '안정성', title: '하위 경로 배포(/pocket-tools/) 호환' }, async () => {
  const sub = await context.newPage();
  const errors = [];
  sub.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const failed = [];
  sub.on('requestfailed', (request) => failed.push(request.url()));
  await sub.goto(SUBPATH, { waitUntil: 'networkidle' });
  await sub.waitForSelector('h1');
  await sub.click(sel('tab-pdf'));
  await sub.click(sel('pdf-mode-to-pdf'));
  await sub.setInputFiles(sel('pdfimg-input'), join(fixtureDir, 'photo-2.png'));
  await sub.waitForSelector(sel('pdfimg-row-0'), { timeout: 20000 });
  await sub.click(sel('pdfimg-generate'));
  await sub.waitForSelector(sel('pdfimg-result'), { timeout: 30000 });
  const manifestHref = await sub.getAttribute('link[rel="manifest"]', 'href');
  const workerOk = await sub.evaluate(async () => {
    const res = await fetch(new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href);
    return res.ok;
  });
  await sub.close();
  const ok = errors.length === 0 && failed.length === 0 && workerOk;
  return { ok, detail: `manifest href="${manifestHref}", pdf 워커 도달=${workerOk}, 콘솔 에러 ${errors.length}, 요청 실패 ${failed.length}` };
});

await run({ group: '안정성', title: '360·390·430px × 7개 탭 가로 스크롤 0' }, async () => {
  const widths = [360, 390, 430];
  const tabs = ['url', 'image', 'ratio', 'pdf', 'exif', 'wm', 'qr'];
  const report = [];
  let ok = true;
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    const clipped = await page
      .locator('.tool-tab-label')
      .evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length);
    if (clipped > 0) ok = false;
    report.push(`${width}/label-clipped:${clipped}`);
    for (const tabKey of tabs) {
      await page.click(sel(`tab-${tabKey}`));
      await page.waitForTimeout(90);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (metrics.scrollWidth > metrics.clientWidth) ok = false;
      report.push(`${width}/${tabKey}:${metrics.scrollWidth}≤${metrics.clientWidth}`);
    }
  }
  await page.setViewportSize(VIEWPORT);
  await page.click(sel('tab-qr'));
  return { ok, detail: report.join(' ') };
});

await run({ group: '안정성', title: '콘솔 에러 0' }, async () => ({
  ok: consoleErrors.length === 0,
  detail: consoleErrors.length ? consoleErrors.join(' | ').slice(0, 600) : '콘솔 에러 없음',
}));

await run({ group: '안정성', title: '페이지 에러 0' }, async () => ({
  ok: pageErrors.length === 0,
  detail: pageErrors.length ? pageErrors.join(' | ').slice(0, 600) : '페이지 에러 없음',
}));

await run({ group: '안정성', title: '외부 네트워크 전송 0건' }, async () => {
  const networkRequests = requestLog.filter((item) => !item.url.startsWith('blob:') && !item.url.startsWith('data:'));
  const local = networkRequests.filter((item) => {
    try {
      return ['127.0.0.1', 'localhost'].includes(new URL(item.url).hostname);
    } catch {
      return false;
    }
  });
  return {
    ok: externalRequests.length === 0,
    detail: `네트워크 요청 ${networkRequests.length}건 전부 자체 오리진(${local.length}건), 외부 ${externalRequests.length}건, 메모리(blob/data) ${localOnlyRequests.length}건${
      externalRequests.length ? ` — ${externalRequests.map((item) => item.url).join(', ')}` : ''
    }`,
  };
});

await run({ group: '안정성', title: '오프라인 재접속 (오프라인 캐시)' }, async () => {
  const offlinePage = await context.newPage();
  await offlinePage.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await offlinePage.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await offlinePage.reload({ waitUntil: 'load' });
  const controlled = await offlinePage.evaluate(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await offlinePage.reload({ waitUntil: 'load' });
  await offlinePage.waitForSelector('h1', { timeout: 15000 });
  const heading = (await offlinePage.textContent('h1')) ?? '';
  const tabs = await offlinePage.locator('[role="tab"]').count();
  await context.setOffline(false);
  await offlinePage.close();
  return { ok: controlled && heading.trim() === 'Pocket Tools' && tabs === 7, detail: `SW 제어=${controlled}, 오프라인 로드 h1="${heading.trim()}", 탭 ${tabs}개` };
});

await browser.close();
await new Promise((resolve) => server.close(resolve));

/* ── 결과 요약 ── */
const failed = checks.filter((check) => !check.ok);
const groups = [...new Set(checks.map((check) => check.group))];
console.log('\n=== 결과 요약 ===');
for (const group of groups) {
  const items = checks.filter((check) => check.group === group);
  const passed = items.filter((item) => item.ok).length;
  console.log(`${group}: ${passed}/${items.length} 통과`);
}
console.log(`전체: ${checks.length - failed.length}/${checks.length} 통과`);

writeFileSync(
  join(here, 'last-report.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), viewport: VIEWPORT, checks, consoleErrors, pageErrors, externalRequests, requests: requestLog }, null, 2),
);

if (failed.length) {
  console.error(`\n실패 ${failed.length}건:`);
  for (const item of failed) console.error(`- ${item.group} · ${item.name}: ${item.detail}`);
  process.exit(1);
}
console.log('모든 검증 통과');
