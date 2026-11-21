/** 워터마크 실제 그리기 (Canvas 2D) — 미리보기와 저장이 같은 함수를 쓰므로 결과가 일치한다. */
import { autoFontSize, clampOpacity, watermarkPoints, type WatermarkPosition } from './watermark';

export interface WatermarkSpec {
  type: 'text' | 'logo';
  text: string;
  color: string;
  opacity: number;
  position: WatermarkPosition;
  /** 기본 크기 대비 배율(0.5~2.5) */
  scale: number;
  logo?: { source: CanvasImageSource; width: number; height: number } | null;
}

export const WATERMARK_FONT = '700 %spx -apple-system, BlinkMacSystemFont, "Noto Sans KR", "Noto Sans CJK KR", "Apple SD Gothic Neo", sans-serif';

function fontSpec(size: number): string {
  return WATERMARK_FONT.replace('%s', String(Math.round(size)));
}

export function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, spec: WatermarkSpec): void {
  const alpha = clampOpacity(spec.opacity);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (spec.type === 'logo' && spec.logo) {
    const markHeight = Math.max(12, Math.round(height * 0.09 * spec.scale));
    const markWidth = Math.max(12, Math.round((spec.logo.width / Math.max(1, spec.logo.height)) * markHeight));
    for (const point of watermarkPoints(spec.position, width, height, markWidth, markHeight)) {
      ctx.drawImage(spec.logo.source, point.x, point.y, markWidth, markHeight);
    }
    ctx.restore();
    return;
  }

  const text = spec.text.trim();
  if (!text) {
    ctx.restore();
    return;
  }

  const fontScale = Math.max(0.5, Math.min(2.5, spec.scale));
  const fontSize = Math.max(10, Math.round(autoFontSize(width, height) * fontScale));
  ctx.font = fontSpec(fontSize);
  ctx.fillStyle = spec.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = Math.max(1, Math.round(fontSize * 0.14));
  ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.03));

  const markWidth = Math.max(4, Math.ceil(ctx.measureText(text).width));
  const markHeight = Math.round(fontSize * 1.18);

  for (const point of watermarkPoints(spec.position, width, height, markWidth, markHeight)) {
    ctx.fillText(text, point.x, point.y);
  }
  ctx.restore();
}
