import { describe, expect, it } from 'vitest';
import { computeRatioLayout, matchesRatio, padColor, ratioValue, RATIO_PRESETS } from './ratio';

describe('ratioValue / RATIO_PRESETS', () => {
  it('비율 4종의 값이 정의되어 있다', () => {
    expect(RATIO_PRESETS.map((item) => item.key)).toEqual(['1:1', '4:5', '9:16', '16:9']);
    expect(ratioValue('9:16')).toEqual({ w: 9, h: 16 });
    expect(ratioValue('16:9')).toEqual({ w: 16, h: 9 });
  });
});

describe('computeRatioLayout — 여백 추가(pad)', () => {
  it('1600×1200 → 1:1 이면 1600×1600, 원본은 세로 중앙에 놓인다', () => {
    const layout = computeRatioLayout(1600, 1200, '1:1', 'pad');
    expect(layout.outWidth).toBe(1600);
    expect(layout.outHeight).toBe(1600);
    expect(layout.image).toEqual({ x: 0, y: 200, w: 1600, h: 1200 });
    expect(matchesRatio(layout.outWidth, layout.outHeight, '1:1')).toBe(true);
  });

  it('1600×1200 → 9:16 이면 900×1600, 원본 전체가 들어간다', () => {
    const layout = computeRatioLayout(1600, 1200, '9:16', 'pad');
    expect(layout.outWidth).toBe(900);
    expect(layout.outHeight).toBe(1600);
    expect(layout.image.w).toBe(900);
    expect(layout.image.h).toBe(675);
    expect(layout.image.y).toBe(463);
    expect(matchesRatio(layout.outWidth, layout.outHeight, '9:16')).toBe(true);
  });

  it('1000×1000 → 4:5 이면 800×1000', () => {
    const layout = computeRatioLayout(1000, 1000, '4:5', 'pad');
    expect(layout.outWidth).toBe(800);
    expect(layout.outHeight).toBe(1000);
    expect(matchesRatio(layout.outWidth, layout.outHeight, '4:5')).toBe(true);
  });

  it('pad는 원본을 자르지 않는다(그리기 영역이 출력 안에 들어옴)', () => {
    const layout = computeRatioLayout(1600, 1200, '16:9', 'pad');
    expect(layout.image.w).toBeLessThanOrEqual(layout.outWidth);
    expect(layout.image.h).toBeLessThanOrEqual(layout.outHeight);
    expect(layout.image.x).toBeGreaterThanOrEqual(0);
    expect(layout.image.y).toBeGreaterThanOrEqual(0);
  });
});

describe('computeRatioLayout — 꽉 채우기(crop)', () => {
  it('1600×1200 → 1:1 이면 1600×1600, 원본을 확대해 넘치는 부분을 자른다', () => {
    const layout = computeRatioLayout(1600, 1200, '1:1', 'crop');
    expect(layout.outWidth).toBe(1600);
    expect(layout.outHeight).toBe(1600);
    expect(layout.image.w).toBeGreaterThanOrEqual(layout.outWidth);
    expect(layout.image.h).toBeGreaterThanOrEqual(layout.outHeight);
    expect(layout.image.y).toBe(0);
  });

  it('1600×1200 → 16:9 이면 1600×900, 세로가 넘치고 위아래가 잘린다', () => {
    const layout = computeRatioLayout(1600, 1200, '16:9', 'crop');
    expect(layout.outWidth).toBe(1600);
    expect(layout.outHeight).toBe(900);
    expect(layout.image.h).toBe(1200);
    expect(layout.image.y).toBe(-150);
  });
});

describe('computeRatioLayout — 해상도 상한·예외', () => {
  it('긴 변이 2048을 넘지 않도록 줄인다', () => {
    const layout = computeRatioLayout(4000, 3000, '1:1', 'pad');
    expect(layout.outWidth).toBe(2048);
    expect(layout.outHeight).toBe(2048);
  });

  it('긴 변이 작으면 확대하지 않는다', () => {
    const layout = computeRatioLayout(640, 480, '1:1', 'pad');
    expect(layout.outWidth).toBe(640);
    expect(layout.outHeight).toBe(640);
  });

  it('크기가 0이면 오류를 던진다', () => {
    expect(() => computeRatioLayout(0, 100, '1:1', 'pad')).toThrow();
  });
});

describe('matchesRatio / padColor', () => {
  it('반올림 오차는 허용한다', () => {
    expect(matchesRatio(900, 1600, '9:16')).toBe(true);
    expect(matchesRatio(900, 1500, '9:16')).toBe(false);
  });

  it('여백 색상은 검정/흰색, 흐림은 검정 위에 그린다', () => {
    expect(padColor('black')).toBe('#000000');
    expect(padColor('white')).toBe('#ffffff');
  });
});
