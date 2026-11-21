/** 선택 영역 모자이크 — 순수 픽셀 연산 (DOM 없이 단위 테스트 가능) */

export interface NormalRegion {
  /** 0~1 정규화 좌표(이미지 기준) */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 드래그 시작/끝 좌표를 이미지 기준 0~1 정규화 사각형으로 변환한다. */
export function normalizeRegion(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  height: number,
): NormalRegion {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const x1 = clamp(Math.min(startX, endX), 0, safeWidth) / safeWidth;
  const x2 = clamp(Math.max(startX, endX), 0, safeWidth) / safeWidth;
  const y1 = clamp(Math.min(startY, endY), 0, safeHeight) / safeHeight;
  const y2 = clamp(Math.max(startY, endY), 0, safeHeight) / safeHeight;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** 정규화 사각형을 실제 픽셀 사각형으로 바꾼다(경계 클램프). */
export function toPixelRegion(region: NormalRegion, width: number, height: number): PixelRegion {
  const x = clamp(Math.round(region.x * width), 0, Math.max(0, width - 1));
  const y = clamp(Math.round(region.y * height), 0, Math.max(0, height - 1));
  const w = Math.max(1, Math.min(width - x, Math.round(region.w * width)));
  const h = Math.max(1, Math.min(height - y, Math.round(region.h * height)));
  return { x, y, w, h };
}

/** 너무 작은(오조작) 영역인지 — 화면 기준 6px 미만은 무시 */
export function isRegionTooSmall(region: NormalRegion, width: number, height: number, minPx = 6): boolean {
  return region.w * width < minPx || region.h * height < minPx;
}

/** 모자이크 강도(0~100)를 이미지 폭 대비 블록 크기(px)로 환산한다. */
export function strengthToBlock(strength: number, width: number): number {
  const s = clamp(strength, 0, 100);
  const ratio = 0.004 + (s / 100) * 0.046;
  return Math.max(2, Math.round(Math.max(1, width) * ratio));
}

/** 한 사각형을 블록 평균색으로 채운다(모자이크). */
export function pixelateRegion(buffer: PixelBuffer, region: PixelRegion, block: number): void {
  const { data, width, height } = buffer;
  const step = Math.max(2, Math.round(block));
  const x0 = clamp(Math.round(region.x), 0, width);
  const y0 = clamp(Math.round(region.y), 0, height);
  const x1 = clamp(Math.round(region.x + region.w), 0, width);
  const y1 = clamp(Math.round(region.y + region.h), 0, height);
  if (x1 <= x0 || y1 <= y0) return;

  for (let by = y0; by < y1; by += step) {
    const byEnd = Math.min(by + step, y1);
    for (let bx = x0; bx < x1; bx += step) {
      const bxEnd = Math.min(bx + step, x1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let y = by; y < byEnd; y += 1) {
        for (let x = bx; x < bxEnd; x += 1) {
          const index = (y * width + x) * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          a += data[index + 3];
          count += 1;
        }
      }
      if (!count) continue;
      const rv = Math.round(r / count);
      const gv = Math.round(g / count);
      const bv = Math.round(b / count);
      const av = Math.round(a / count);
      for (let y = by; y < byEnd; y += 1) {
        for (let x = bx; x < bxEnd; x += 1) {
          const index = (y * width + x) * 4;
          data[index] = rv;
          data[index + 1] = gv;
          data[index + 2] = bv;
          data[index + 3] = av;
        }
      }
    }
  }
}

/** 여러 영역을 차례로 모자이크 처리한다. */
export function applyMosaic(buffer: PixelBuffer, regions: PixelRegion[], block: number): void {
  for (const region of regions) pixelateRegion(buffer, region, block);
}

/** 저장용: 정규화 영역 목록을 실제 해상도 기준 픽셀 영역으로 변환 */
export function regionsToPixels(regions: NormalRegion[], width: number, height: number): PixelRegion[] {
  return regions.map((region) => toPixelRegion(region, width, height));
}
