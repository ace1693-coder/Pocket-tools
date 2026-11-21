import { useEffect, useRef, useState } from 'react';
import { canvasToBlob, checkPhotoFile, context2d, createCanvas, decodeImage, suffixFileName } from '../lib/canvasImage';
import { formatBytes } from '../lib/format';
import {
  PAD_BACKGROUNDS,
  RATIO_FORMATS,
  RATIO_PRESETS,
  computeRatioLayout,
  matchesRatio,
  padColor,
  type PadBackground,
  type RatioFormat,
  type RatioKey,
  type RatioMode,
} from '../lib/ratio';
import { ErrorAlert, FileDropzone, Segmented } from './ui';

interface RatioResult {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  size: number;
  sourceWidth: number;
  sourceHeight: number;
  durationMs: number;
}

export default function RatioResizer() {
  const [file, setFile] = useState<File | null>(null);
  const [ratio, setRatio] = useState<RatioKey>('1:1');
  const [mode, setMode] = useState<RatioMode>('pad');
  const [background, setBackground] = useState<PadBackground>('black');
  const [format, setFormat] = useState<RatioFormat>('image/png');
  const [result, setResult] = useState<RatioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<RatioResult | null>(null);
  resultRef.current = result;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null;
      try {
        decoded = await decodeImage(file);
        const layout = computeRatioLayout(decoded.width, decoded.height, ratio, mode);
        const canvas = createCanvas(layout.outWidth, layout.outHeight);
        const ctx = context2d(canvas);

        if (mode === 'pad') {
          if (background === 'blur') {
            // 꽉 채운 원본을 흐리게 깔아 여백을 채운다. 가장자리 번짐을 숨기려 살짝 확대한다.
            const overscan = 1.14;
            const cw = Math.round(layout.cover.w * overscan);
            const ch = Math.round(layout.cover.h * overscan);
            ctx.save();
            ctx.filter = `blur(${Math.max(8, Math.round(Math.min(layout.outWidth, layout.outHeight) * 0.05))}px)`;
            ctx.drawImage(decoded.source, Math.round((layout.outWidth - cw) / 2), Math.round((layout.outHeight - ch) / 2), cw, ch);
            ctx.restore();
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            ctx.fillStyle = padColor(background);
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        } else if (format === 'image/jpeg') {
          // 크롭 모드는 빈 영역이 생기지 않지만, JPEG 투명 처리 대비 흰 배경을 깐다.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(decoded.source, layout.image.x, layout.image.y, layout.image.w, layout.image.h);

        const started = performance.now();
        const blob = await canvasToBlob(canvas, format, format === 'image/png' ? undefined : 0.92);
        const next: RatioResult = {
          url: URL.createObjectURL(blob),
          blob,
          width: canvas.width,
          height: canvas.height,
          size: blob.size,
          sourceWidth: decoded.width,
          sourceHeight: decoded.height,
          durationMs: Math.round(performance.now() - started),
        };
        if (cancelled) {
          URL.revokeObjectURL(next.url);
          return;
        }
        setResult((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return next;
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setResult((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return null;
        });
        setError(err instanceof Error ? err.message : '이미지를 변환하지 못했습니다.');
      } finally {
        decoded?.close();
        if (!cancelled) setBusy(false);
      }
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [file, ratio, mode, background, format]);

  useEffect(
    () => () => {
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );

  function pick(files: File[]) {
    const next = files[0];
    if (!next) return;
    const check = checkPhotoFile(next);
    if (!check.ok) {
      setError(check.reason ?? '지원하지 않는 파일입니다.');
      setFile(null);
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      return;
    }
    setError(null);
    setFile(next);
  }

  function reset() {
    setFile(null);
    setError(null);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setBusy(false);
  }

  const ratioOk = result ? matchesRatio(result.width, result.height, ratio) : false;
  const downloadName = file && result ? suffixFileName(file.name, `${ratio.replace(':', 'x')}-${mode === 'pad' ? '여백' : '꽉채움'}`, format) : 'ratio.png';

  return (
    <section className="panel" aria-labelledby="ratio-title">
      <header className="panel-head">
        <h2 id="ratio-title">사진 비율 조정</h2>
        <p className="panel-desc">1:1 · 4:5 · 9:16 · 16:9로 자르거나 여백을 채웁니다. 잘림 없이 여백을 넣거나, 꽉 채우고 중앙을 남길 수 있어요.</p>
      </header>

      <FileDropzone
        testId="ratio"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        title="비율을 바꿀 사진을 끌어다 놓거나"
        buttonLabel="사진 선택"
        hint="JPG · PNG · WebP · 최대 40MB"
        onFiles={pick}
      />

      <ErrorAlert message={error} testId="ratio-error" />

      {file && (
        <p className="file-info" data-testid="ratio-file-info">
          <span className="file-name">{file.name}</span>
          <span className="file-meta">{formatBytes(file.size)}</span>
        </p>
      )}

      <div className="control-group">
        <span className="field-label">비율</span>
        <div className="ratio-grid" role="group" aria-label="출력 비율">
          {RATIO_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`ratio-cell${ratio === preset.key ? ' ratio-cell-active' : ''}`}
              aria-pressed={ratio === preset.key}
              onClick={() => setRatio(preset.key)}
              data-testid={`ratio-opt-${preset.key.replace(':', 'x')}`}
            >
              <span className="ratio-shape-box">
                <span
                  className="ratio-shape"
                  aria-hidden="true"
                  style={{
                    width: `${Math.round(preset.w >= preset.h ? 28 : (28 * preset.w) / preset.h)}px`,
                    height: `${Math.round(preset.h >= preset.w ? 28 : (28 * preset.h) / preset.w)}px`,
                  }}
                />
              </span>
              <span className="ratio-cell-label">{preset.label}</span>
              <span className="ratio-cell-desc">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      <Segmented<RatioMode>
        label="처리 방식"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'pad', label: '잘림 방지 (여백)', testId: 'ratio-mode-pad' },
          { value: 'crop', label: '꽉 채우기 (중앙 크롭)', testId: 'ratio-mode-crop' },
        ]}
        hint={mode === 'pad' ? '사진 전체가 남고 남는 곳을 배경으로 채웁니다.' : '사진을 확대해 프레임을 가득 채우고, 넘치는 가장자리를 잘라냅니다.'}
      />

      {mode === 'pad' && (
        <Segmented<PadBackground>
          label="여백 배경"
          value={background}
          onChange={setBackground}
          options={PAD_BACKGROUNDS.map((item) => ({ value: item.value, label: item.label, testId: `ratio-bg-${item.value}` }))}
        />
      )}

      <Segmented<RatioFormat>
        label="출력 형식"
        value={format}
        onChange={setFormat}
        options={RATIO_FORMATS.map((item) => ({
          value: item.value,
          label: item.label,
          testId: `ratio-format-${item.value.replace('image/', '')}`,
        }))}
      />

      {busy && (
        <p className="hint" role="status" data-testid="ratio-busy">
          비율을 맞추는 중…
        </p>
      )}

      {result && (
        <div className="result-block" data-testid="ratio-result">
          <div className="preview-wrap">
            <img className="preview preview-portrait" src={result.url} alt="비율 조정 결과 미리보기" data-testid="ratio-preview" />
          </div>

          <dl className="stats">
            <div>
              <dt>변경 전 해상도</dt>
              <dd data-testid="ratio-dims-before">
                {result.sourceWidth}×{result.sourceHeight}
              </dd>
            </div>
            <div>
              <dt>변경 후 해상도</dt>
              <dd data-testid="ratio-dims-after">
                {result.width}×{result.height}
              </dd>
            </div>
            <div>
              <dt>변경 전 용량</dt>
              <dd data-testid="ratio-size-before">{file ? formatBytes(file.size) : '-'}</dd>
            </div>
            <div>
              <dt>변경 후 용량</dt>
              <dd data-testid="ratio-size-after">{formatBytes(result.size)}</dd>
            </div>
          </dl>

          <p className={`hint${ratioOk ? ' hint-good' : ' hint-warn'}`} data-testid="ratio-check">
            {ratioOk ? `비율 확인: ${ratio} 일치` : `비율 확인: ${ratio}와 다름`} · {Math.round(result.durationMs)}ms 처리
          </p>

          <a className="btn btn-primary btn-wide" href={result.url} download={downloadName} data-testid="ratio-download">
            비율 조정한 사진 다운로드
          </a>
          <button type="button" className="btn btn-ghost btn-wide" onClick={reset} data-testid="ratio-reset">
            다른 사진 선택
          </button>
        </div>
      )}
    </section>
  );
}
