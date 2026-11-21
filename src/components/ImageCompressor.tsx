import { useEffect, useRef, useState } from 'react';
import { checkImageFile, compressImage, outputFileName, type CompressResult, type OutputFormat } from '../lib/imageCompress';
import { formatBytes, formatExtension, formatPercent } from '../lib/format';

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'original', label: '원본 유지' },
  { value: 'image/webp', label: 'WebP' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
];

export default function ImageCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(70);
  const [format, setFormat] = useState<OutputFormat>('original');
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await compressImage(file, { quality: quality / 100, format });
        if (cancelled) {
          URL.revokeObjectURL(res.url);
          return;
        }
        setResult((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return res;
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setResult((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return null;
        });
        setError(err instanceof Error ? err.message : '압축 중 오류가 발생했습니다.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [file, quality, format]);

  function pick(files: FileList | null) {
    const next = files && files[0];
    if (!next) return;
    const check = checkImageFile(next);
    if (!check.ok) {
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setFile(null);
      setError(check.reason ?? '지원하지 않는 파일입니다.');
      return;
    }
    setError(null);
    setFile(next);
  }

  function reset() {
    setFile(null);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="panel" aria-labelledby="image-title">
      <header className="panel-head">
        <h2 id="image-title">이미지 압축</h2>
        <p className="panel-desc">JPG · PNG · WebP를 기기 안에서 바로 줄입니다. 사진은 업로드되지 않습니다.</p>
      </header>

      <input
        ref={inputRef}
        id="image-input"
        className="file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => pick(event.target.files)}
        data-testid="image-input"
      />

      <div
        className={`dropzone${dragOver ? ' dropzone-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          pick(event.dataTransfer?.files ?? null);
        }}
        data-testid="image-dropzone"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className="drop-icon">
          <path
            d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="drop-title">이미지를 여기에 끌어다 놓거나</p>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} data-testid="image-select-button">
          이미지 선택
        </button>
        <p className="hint">JPG · PNG · WebP · 최대 40MB</p>
      </div>

      {error && (
        <p className="alert alert-error" role="alert" data-testid="image-error">
          {error}
        </p>
      )}

      {file && (
        <p className="file-info" data-testid="image-file-info">
          <span className="file-name">{file.name}</span>
          <span className="file-meta">
            {formatExtension(file.type || 'image/jpeg')} · {formatBytes(file.size)}
          </span>
        </p>
      )}

      <div className="control-group">
        <label className="field-label" htmlFor="quality-range">
          압축 품질 <span className="value-badge" data-testid="quality-value">{quality}%</span>
        </label>
        <input
          id="quality-range"
          className="range"
          type="range"
          min={10}
          max={100}
          step={5}
          value={quality}
          onChange={(event) => setQuality(Number(event.target.value))}
          data-testid="quality-range"
        />
        <div className="range-scale">
          <span>10% (용량 최소)</span>
          <span>100% (화질 우선)</span>
        </div>
        {format === 'image/png' && <p className="hint">PNG는 무손실 형식이라 품질 설정이 적용되지 않습니다.</p>}
      </div>

      <div className="control-group">
        <span className="field-label" id="format-label">
          출력 형식
        </span>
        <div className="segmented" role="group" aria-labelledby="format-label">
          {FORMATS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`segment${format === item.value ? ' segment-active' : ''}`}
              aria-pressed={format === item.value}
              onClick={() => setFormat(item.value)}
              data-testid={`format-${item.value.replace('image/', '')}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="hint">
          PNG는 무손실 포맷이라 용량이 거의 줄지 않습니다. 용량을 줄이려면 WebP(권장) 또는 JPEG를 선택하세요. 압축 시 원본보다 화질이
          약간 손실될 수 있습니다.
        </p>
      </div>

      {busy && (
        <p className="hint" role="status" data-testid="image-busy">
          압축하는 중…
        </p>
      )}

      {result && (
        <div className="result-block" data-testid="image-result">
          <div className="preview-wrap">
            <img className="preview" src={result.url} alt="압축된 이미지 미리보기" data-testid="image-preview" />
          </div>

          <dl className="stats">
            <div>
              <dt>원본</dt>
              <dd data-testid="size-before">{formatBytes(result.originalSize)}</dd>
            </div>
            <div>
              <dt>압축 후</dt>
              <dd data-testid="size-after">{formatBytes(result.size)}</dd>
            </div>
            <div>
              <dt>절감률</dt>
              <dd className={result.savings !== null && result.savings > 0 ? 'stat-good' : 'stat-warn'} data-testid="size-savings">
                {formatPercent(result.savings)}
              </dd>
            </div>
            <div>
              <dt>해상도</dt>
              <dd>
                {result.width}×{result.height}
              </dd>
            </div>
          </dl>

          <p className="hint" data-testid="image-result-meta">
            {formatExtension(result.mime)} · {Math.round(result.durationMs)}ms 처리
            {result.savings !== null && result.savings < 0
              ? ' · 이 설정에서는 용량이 늘었습니다. WebP나 낮은 품질을 선택해 보세요.'
              : ''}
          </p>

          {file && (
            <a
              className="btn btn-primary btn-wide"
              href={result.url}
              download={outputFileName(file.name, result.mime)}
              data-testid="image-download"
            >
              압축된 이미지 다운로드
            </a>
          )}
          <button type="button" className="btn btn-ghost btn-wide" onClick={reset} data-testid="image-reset">
            다른 이미지 선택
          </button>
        </div>
      )}
    </section>
  );
}
