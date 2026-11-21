/** 워터마크 위치·투명도 계산 — 순수 로직 (DOM 없이 단위 테스트 가능) */

export type WatermarkPosition = 'tl' | 'tr' | 'center' | 'bl' | 'br' | 'tile';

export const WATERMARK_POSITIONS: { value: WatermarkPosition; label: string; short: string }[] = [
  { value: 'tl', label: '좌상단', short: '↖' },
  { value: 'tr', label: '우상단', short: '↗' },
  { value: 'center', label: '중앙', short: '◎' },
  { value: 'bl', label: '좌하단', short: '↙' },
  { value: 'br', label: '우하단', short: '↘' },
  { value: 'tile', label: '격자 반복', short: '▦' },
];

export interface Point {
  x: number;
  y: number;
}

/** 이미지 크기에 비례한 기본 여백 */
export function watermarkMargin(canvasWidth: number, canvasHeight: number): number {
  return Math.max(6, Math.round(Math.min(canvasWidth, canvasHeight) * 0.04));
}

/** 워터마크 폭·높이와 여백을 받아 좌상단 좌표를 계산한다. */
export function positionPoint(
  position: Exclude<WatermarkPosition, 'tile'>,
  canvasWidth: number,
  canvasHeight: number,
  markWidth: number,
  markHeight: number,
  margin: number,
): Point {
  const right = canvasWidth - margin - markWidth;
  const bottom = canvasHeight - margin - markHeight;
  switch (position) {
    case 'tl':
      return { x: margin, y: margin };
    case 'tr':
      return { x: right, y: margin };
    case 'center':
      return { x: Math.round((canvasWidth - markWidth) / 2), y: Math.round((canvasHeight - markHeight) / 2) };
    case 'bl':
      return { x: margin, y: bottom };
    case 'br':
    default:
      return { x: right, y: bottom };
  }
}

/** 격자 반복 배치 — 홀수 행은 반 칸 밀어 빈틈을 줄인다. */
export function tilePositions(
  canvasWidth: number,
  canvasHeight: number,
  markWidth: number,
  markHeight: number,
  margin = watermarkMargin(canvasWidth, canvasHeight),
): Point[] {
  const gapX = Math.max(8, Math.round(markWidth * 0.6));
  const gapY = Math.max(8, Math.round(markHeight * 1.1));
  const cols = Math.max(1, Math.floor((canvasWidth - margin * 2 + gapX) / (markWidth + gapX)));
  const rows = Math.max(1, Math.floor((canvasHeight - margin * 2 + gapY) / (markHeight + gapY)));
  const stepX = markWidth + gapX;
  const stepY = markHeight + gapY;
  const totalWidth = cols * markWidth + (cols - 1) * gapX;
  const totalHeight = rows * markHeight + (rows - 1) * gapY;
  const startX = Math.round((canvasWidth - totalWidth) / 2);
  const startY = Math.round((canvasHeight - totalHeight) / 2);

  const points: Point[] = [];
  for (let row = 0; row < rows; row += 1) {
    const offsetX = row % 2 === 1 ? Math.round(stepX / 2) : 0;
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(canvasWidth - markWidth, Math.max(0, startX + col * stepX + offsetX));
      const y = Math.min(canvasHeight - markHeight, Math.max(0, startY + row * stepY));
      points.push({ x, y });
    }
  }
  return points;
}

/** 위치 값에 해당하는 모든 배치 좌표 */
export function watermarkPoints(
  position: WatermarkPosition,
  canvasWidth: number,
  canvasHeight: number,
  markWidth: number,
  markHeight: number,
): Point[] {
  if (position === 'tile') return tilePositions(canvasWidth, canvasHeight, markWidth, markHeight);
  return [positionPoint(position, canvasWidth, canvasHeight, markWidth, markHeight, watermarkMargin(canvasWidth, canvasHeight))];
}

/** 투명도(%)를 0.1~1 알파로 제한 */
export function clampOpacity(percent: number): number {
  return Math.min(100, Math.max(10, Math.round(percent))) / 100;
}

/** 화면 크기에 맞는 기본 글자 크기 */
export function autoFontSize(canvasWidth: number, canvasHeight: number): number {
  const base = Math.min(canvasWidth, canvasHeight) * 0.055;
  return Math.max(12, Math.min(480, Math.round(base)));
}
