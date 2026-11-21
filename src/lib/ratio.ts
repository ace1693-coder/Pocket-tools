/** 사진 비율 조정 — 순수 계산 로직 (DOM 없이 단위 테스트 가능) */

export type RatioKey = '1:1' | '4:5' | '9:16' | '16:9';

export interface RatioPreset {
  key: RatioKey;
  label: string;
  description: string;
  w: number;
  h: number;
}

export const RATIO_PRESETS: RatioPreset[] = [
  { key: '1:1', label: '1:1', description: '정사각형 · 프로필', w: 1, h: 1 },
  { key: '4:5', label: '4:5', description: '인스타 피드', w: 4, h: 5 },
  { key: '9:16', label: '9:16', description: '릴스 · 스토리', w: 9, h: 16 },
  { key: '16:9', label: '16:9', description: '가로 영상 · 썸네일', w: 16, h: 9 },
];

export type RatioMode = 'pad' | 'crop';
export type PadBackground = 'black' | 'white' | 'blur';

export const PAD_BACKGROUNDS: { value: PadBackground; label: string }[] = [
  { value: 'black', label: '검정' },
  { value: 'white', label: '흰색' },
  { value: 'blur', label: '흐린 원본' },
];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RatioLayout {
  outWidth: number;
  outHeight: number;
  /** 원본을 그릴 위치(잘림 모드에서는 음수 좌표로 캔버스 밖을 향한다) */
  image: Rect;
  /** 블러 배경용 꽉 채우기 위치 */
  cover: Rect;
}

export function ratioPreset(key: RatioKey): RatioPreset {
  return RATIO_PRESETS.find((item) => item.key === key) ?? RATIO_PRESETS[0];
}

/** 비율 키의 가로/세로 값 */
export function ratioValue(key: RatioKey): { w: number; h: number } {
  const preset = ratioPreset(key);
  return { w: preset.w, h: preset.h };
}

function fitRect(srcWidth: number, srcHeight: number, boxWidth: number, boxHeight: number, mode: 'contain' | 'cover'): Rect {
  const scale = mode === 'contain' ? Math.min(boxWidth / srcWidth, boxHeight / srcHeight) : Math.max(boxWidth / srcWidth, boxHeight / srcHeight);
  const w = Math.max(1, Math.round(srcWidth * scale));
  const h = Math.max(1, Math.round(srcHeight * scale));
  return { x: Math.round((boxWidth - w) / 2), y: Math.round((boxHeight - h) / 2), w, h };
}

/**
 * 원본 크기·비율·모드로 출력 캔버스 크기와 그리기 위치를 계산한다.
 * - pad: 원본 전체를 안에 넣고 남는 곳을 배경으로 채운다(잘림 없음).
 * - crop: 출력 비율에 맞게 확대해 가운데를 남기고 가장자리를 잘라낸다.
 * - 출력 긴 변은 원본 긴 변을 유지하되 maxSide로 제한한다.
 */
export function computeRatioLayout(
  srcWidth: number,
  srcHeight: number,
  key: RatioKey,
  mode: RatioMode,
  maxSide = 2048,
): RatioLayout {
  if (!(srcWidth > 0) || !(srcHeight > 0)) {
    throw new Error('이미지 크기를 읽을 수 없습니다.');
  }
  const { w: rw, h: rh } = ratioValue(key);
  const base = Math.max(16, Math.min(maxSide, Math.max(srcWidth, srcHeight)));
  const outWidth = rw >= rh ? base : Math.max(16, Math.round((base * rw) / rh));
  const outHeight = rw >= rh ? Math.max(16, Math.round((base * rh) / rw)) : base;

  return {
    outWidth,
    outHeight,
    image: fitRect(srcWidth, srcHeight, outWidth, outHeight, mode === 'pad' ? 'contain' : 'cover'),
    cover: fitRect(srcWidth, srcHeight, outWidth, outHeight, 'cover'),
  };
}

/** 출력 픽셀이 목표 비율과 일치하는지(반올림 오차 허용) */
export function matchesRatio(width: number, height: number, key: RatioKey, tolerance = 0.01): boolean {
  const { w, h } = ratioValue(key);
  return Math.abs(width / height - w / h) <= tolerance;
}

export function padColor(background: PadBackground): string {
  return background === 'white' ? '#ffffff' : '#000000';
}

export type RatioFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export const RATIO_FORMATS: { value: RatioFormat; label: string }[] = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/webp', label: 'WebP' },
];
