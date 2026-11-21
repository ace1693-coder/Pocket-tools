import { describe, expect, it } from 'vitest';
import { applyMosaic, isRegionTooSmall, normalizeRegion, pixelateRegion, regionsToPixels, strengthToBlock, toPixelRegion } from './mosaic';

function makeBuffer(width: number, height: number): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = (x * 7) % 255;
      data[index + 1] = (y * 11) % 255;
      data[index + 2] = 40;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

function pixelAt(buffer: { data: Uint8ClampedArray; width: number }, x: number, y: number): number[] {
  const index = (y * buffer.width + x) * 4;
  return [buffer.data[index], buffer.data[index + 1], buffer.data[index + 2], buffer.data[index + 3]];
}

describe('normalizeRegion', () => {
  it('드래그 방향과 무관하게 정렬하고 0~1로 정규화한다', () => {
    const region = normalizeRegion(80, 90, 20, 30, 100, 100);
    expect(region.x).toBeCloseTo(0.2, 6);
    expect(region.y).toBeCloseTo(0.3, 6);
    expect(region.w).toBeCloseTo(0.6, 6);
    expect(region.h).toBeCloseTo(0.6, 6);
  });

  it('이미지 밖 좌표는 경계로 자른다', () => {
    const region = normalizeRegion(-50, -50, 200, 200, 100, 100);
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
    expect(region.w).toBe(1);
    expect(region.h).toBe(1);
  });

  it('작은 드래그(6px 미만)는 무시 대상으로 판단한다', () => {
    const small = normalizeRegion(10, 10, 12, 12, 100, 100);
    expect(isRegionTooSmall(small, 100, 100)).toBe(true);
    const big = normalizeRegion(10, 10, 50, 50, 100, 100);
    expect(isRegionTooSmall(big, 100, 100)).toBe(false);
  });
});

describe('toPixelRegion / regionsToPixels', () => {
  it('정규화 영역을 픽셀 영역으로 바꾼다', () => {
    expect(toPixelRegion({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 400, 200)).toEqual({ x: 100, y: 100, w: 200, h: 50 });
  });

  it('경계를 넘는 영역은 이미지 안으로 자른다', () => {
    expect(toPixelRegion({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 100, 100)).toEqual({ x: 90, y: 90, w: 10, h: 10 });
  });

  it('여러 영역을 한 번에 변환한다', () => {
    const pixels = regionsToPixels(
      [
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ],
      200,
      200,
    );
    expect(pixels).toEqual([
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 100, y: 100, w: 100, h: 100 },
    ]);
  });
});

describe('strengthToBlock', () => {
  it('강도가 높을수록 블록이 커지고 최소 2px을 지킨다', () => {
    const weak = strengthToBlock(10, 1000);
    const strong = strengthToBlock(90, 1000);
    expect(strong).toBeGreaterThan(weak);
    expect(strengthToBlock(0, 10)).toBeGreaterThanOrEqual(2);
    expect(strengthToBlock(100, 1000)).toBe(50);
  });

  it('같은 강도는 이미지 폭에 비례해 커진다(미리보기와 원본의 모자이크가 같아 보이도록)', () => {
    expect(strengthToBlock(50, 1000)).toBe(27);
    expect(strengthToBlock(50, 2000)).toBe(54);
  });
});

describe('pixelateRegion', () => {
  it('영역 안쪽은 블록 평균색으로 채우고 바깥은 건드리지 않는다', () => {
    const buffer = makeBuffer(20, 20);
    const before = makeBuffer(20, 20);
    pixelateRegion(buffer, { x: 5, y: 5, w: 10, h: 10 }, 5);

    // 영역 밖(0,0)은 그대로
    expect(pixelAt(buffer, 0, 0)).toEqual(pixelAt(before, 0, 0));
    // 블록(5,5)-(9,9) 안의 모든 픽셀은 같아진다
    const anchor = pixelAt(buffer, 5, 5);
    for (let y = 5; y < 10; y += 1) {
      for (let x = 5; x < 10; x += 1) {
        expect(pixelAt(buffer, x, y)).toEqual(anchor);
      }
    }
    // 알파는 유지된다
    expect(anchor[3]).toBe(255);
  });

  it('블록 평균값이 실제 원본 평균과 일치한다', () => {
    const buffer = makeBuffer(20, 20);
    let r = 0;
    let g = 0;
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const index = (y * 20 + x) * 4;
        r += buffer.data[index];
        g += buffer.data[index + 1];
      }
    }
    pixelateRegion(buffer, { x: 0, y: 0, w: 5, h: 5 }, 5);
    const [rv, gv] = pixelAt(buffer, 0, 0);
    expect(rv).toBe(Math.round(r / 25));
    expect(gv).toBe(Math.round(g / 25));
  });

  it('영역이 이미지 밖으로 나가도 안전하다', () => {
    const buffer = makeBuffer(10, 10);
    expect(() => pixelateRegion(buffer, { x: -5, y: -5, w: 30, h: 30 }, 4)).not.toThrow();
    expect(() => pixelateRegion(buffer, { x: 20, y: 20, w: 5, h: 5 }, 4)).not.toThrow();
  });
});

describe('applyMosaic', () => {
  it('여러 영역을 모두 처리한다', () => {
    const buffer = makeBuffer(40, 40);
    const original = makeBuffer(40, 40);
    applyMosaic(
      buffer,
      [
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 20, w: 10, h: 10 },
      ],
      5,
    );
    expect(pixelAt(buffer, 1, 1)).not.toEqual(pixelAt(original, 1, 1));
    expect(pixelAt(buffer, 22, 22)).not.toEqual(pixelAt(original, 22, 22));
    // 첫 블록 안은 모두 같은 색이 된다
    expect(pixelAt(buffer, 1, 1)).toEqual(pixelAt(buffer, 4, 4));
    expect(pixelAt(buffer, 35, 2)).toEqual(pixelAt(original, 35, 2));
  });
});
