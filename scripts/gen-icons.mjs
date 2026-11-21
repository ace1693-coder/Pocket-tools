/**
 * PWA 아이콘 PNG 실제 생성기 (외부 의존성 없음, Node zlib만 사용)
 * - icon-192.png, icon-512.png : 둥근 사각 배경 + 공구함 심볼
 * - icon-maskable-512.png      : 안전 영역(80%) 안에 축소 배치한 마스커블 아이콘
 *
 * 실행: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');

/* ── PNG 인코더 ── */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 도형 헬퍼 (정규화 좌표 0~1) ── */
function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

const WHITE = [255, 255, 255];
const ACCENT = [47, 110, 235];

function sampleColor(x, y, artScale) {
  // 중심 기준 축소 (마스커블 안전 영역)
  const ax = 0.5 + (x - 0.5) / artScale;
  const ay = 0.5 + (y - 0.5) / artScale;

  // 배경 그라디언트 (대각선)
  const t = Math.min(1, Math.max(0, (x * 0.55 + y * 0.45)));
  const bg = [
    Math.round(90 + (110 - 90) * t) - 30,
    Math.round(160 + (95 - 160) * t) - 25,
    Math.round(255 + (250 - 255) * t),
  ];

  // 공구함 손잡이 (링)
  const handleOuter = insideRoundRect(ax, ay, 0.385, 0.255, 0.615, 0.47, 0.05);
  const handleInner = insideRoundRect(ax, ay, 0.435, 0.3, 0.565, 0.47, 0.03);
  if (handleOuter && !handleInner) return WHITE;

  // 본체
  const body = insideRoundRect(ax, ay, 0.235, 0.415, 0.765, 0.765, 0.06);
  if (body) {
    // 뚜껑 경계선 + 잠금쇠
    const lidLine = insideRoundRect(ax, ay, 0.235, 0.525, 0.765, 0.552, 0.008);
    const latch = insideRoundRect(ax, ay, 0.462, 0.5, 0.538, 0.578, 0.014);
    if (latch) return ACCENT;
    if (lidLine) return [188, 214, 255];
    return WHITE;
  }

  return bg;
}

function render(size, artScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 3; // 슈퍼샘플링
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const px = (x + (sx + 0.5) / ss) / size;
          const py = (y + (sy + 0.5) / ss) / size;
          const [cr, cg, cb] = sampleColor(px, py, artScale);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(outDir, { recursive: true });
const targets = [
  { file: 'icon-192.png', size: 192, scale: 0.92 },
  { file: 'icon-512.png', size: 512, scale: 0.92 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.72 },
];

for (const target of targets) {
  const png = render(target.size, target.scale);
  writeFileSync(join(outDir, target.file), png);
  console.log(`created public/icons/${target.file} (${target.size}x${target.size}, ${png.length} bytes)`);
}
