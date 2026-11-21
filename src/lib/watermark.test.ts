import { describe, expect, it } from 'vitest';
import {
  WATERMARK_POSITIONS,
  autoFontSize,
  clampOpacity,
  positionPoint,
  tilePositions,
  watermarkMargin,
  watermarkPoints,
} from './watermark';

describe('watermarkMargin / positionPoint', () => {
  it('여백은 이미지 짧은 변의 4%(최소 6px)', () => {
    expect(watermarkMargin(1000, 800)).toBe(32);
    expect(watermarkMargin(100, 100)).toBe(6);
  });

  it('5개 고정 위치를 정확히 계산한다', () => {
    const args = [1000, 1000, 200, 100, 40] as const;
    expect(positionPoint('tl', ...args)).toEqual({ x: 40, y: 40 });
    expect(positionPoint('tr', ...args)).toEqual({ x: 760, y: 40 });
    expect(positionPoint('center', 1000, 1000, 200, 100, 40)).toEqual({ x: 400, y: 450 });
    expect(positionPoint('bl', ...args)).toEqual({ x: 40, y: 860 });
    expect(positionPoint('br', ...args)).toEqual({ x: 760, y: 860 });
  });
});

describe('tilePositions / watermarkPoints', () => {
  it('격자 반복은 이미지 안에 여러 개를 배치한다', () => {
    const points = tilePositions(1000, 1000, 100, 40);
    expect(points.length).toBeGreaterThan(6);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x + 100).toBeLessThanOrEqual(1000);
      expect(point.y + 40).toBeLessThanOrEqual(1000);
    }
    // 홀수 행은 반 칸 밀려 있다
    expect(points[0].y).toBeLessThan(points[points.length - 1].y);
  });

  it('tile 이외의 위치는 좌표 1개만 돌려준다', () => {
    expect(watermarkPoints('center', 800, 600, 100, 50)).toHaveLength(1);
    expect(watermarkPoints('tile', 800, 600, 100, 50).length).toBeGreaterThan(1);
  });

  it('위치 6종이 모두 정의되어 있다', () => {
    expect(WATERMARK_POSITIONS.map((item) => item.value)).toEqual(['tl', 'tr', 'center', 'bl', 'br', 'tile']);
  });
});

describe('clampOpacity', () => {
  it('10~100% 범위로 제한하고 알파로 바꾼다', () => {
    expect(clampOpacity(0)).toBe(0.1);
    expect(clampOpacity(55)).toBe(0.55);
    expect(clampOpacity(100)).toBe(1);
    expect(clampOpacity(240)).toBe(1);
  });
});

describe('autoFontSize', () => {
  it('이미지가 크면 글자도 커진다', () => {
    expect(autoFontSize(1000, 1000)).toBe(55);
    expect(autoFontSize(2000, 2000)).toBe(110);
    expect(autoFontSize(50, 50)).toBe(12);
  });
});
