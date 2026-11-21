import { useEffect, useRef, useState } from 'react';
import {
  canvasToBlob,
  checkPhotoFile,
  context2d,
  createCanvas,
  decodeImage,
  suffixFileName,
  triggerDownload,
  type DecodedImage,
} from '../lib/canvasImage';
import { formatBytes } from '../lib/format';
import { drawWatermark, type WatermarkSpec } from '../lib/watermarkDraw';
import { WATERMARK_POSITIONS, type WatermarkPosition } from '../lib/watermark';
import { createZip, zipFileName } from '../lib/zip';
import { ErrorAlert, FileDropzone, RangeControl, Segmented } from './ui';

interface WatermarkItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

interface WatermarkResult {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  size: number;
}

type MarkKind = 'text' | 'logo';
type LogoImage = { source: HTMLImageElement; width: number; height: number; name: string };

const PREVIEW_MAX = 900;
const EXPORT_MAX = 4096;
let wmSeq = 0;

export default function Watermark() {
  const [items, setItems] = useState<WatermarkItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [kind, setKind] = useState<MarkKind>('text');
  const [text, setText] = useState('');
  const [opacity, setOpacity] = useState(60);
  const [position, setPosition] = useState<WatermarkPosition>('br');
  const [color, setColor] = useState('#ffffff');
  const [scale, setScale] = useState(100);
  const [logo, setLogo] = useState<LogoImage | null>(null);
  const [results, setResults] = useState<WatermarkResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const itemsRef = useRef<WatermarkItem[]>([]);
  itemsRef.current = items;
  const resultsRef = useRef<WatermarkResult[]>([]);
  resultsRef.current = results;
  const logoRef = useRef<LogoImage | null>(null);
  logoRef.current = logo;

  useEffect(
    () => () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
      for (const result of resultsRef.current) URL.revokeObjectURL(result.url);
      if (logoRef.current) URL.revokeObjectURL(logoRef.current.source.src);
    },
    [],
  );

  /* 선택한 사진을 미리보기 이미지로 읽는다 */
  useEffect(() => {
    const item = items[activeIndex];
    if (!item) {
      previewImageRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.src = item.previewUrl;
    img
      .decode()
      .then(() => {
        if (cancelled) return;
        previewImageRef.current = img;
        setPreviewVersion((prev) => prev + 1);
      })
      .catch(() => {
        if (!cancelled) setError('미리보기를 만들지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [items, activeIndex]);

  const spec: WatermarkSpec = {
    type: kind,
    text,
    color,
    opacity,
    position,
    scale: scale / 100,
    logo: logo ? { source: logo.source, width: logo.width, height: logo.height } : null,
  };

  /* 미리보기 캔버스 그리기(컨트롤을 바꾸면 즉시 반영) */
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = previewImageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PREVIEW_MAX;
    canvas.height = Math.max(1, Math.round((image.naturalHeight / Math.max(1, image.naturalWidth)) * PREVIEW_MAX));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (kind === 'logo' && !logo) return;
    if (kind === 'text' && !text.trim()) return;
    drawWatermark(ctx, canvas.width, canvas.height, spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVersion, kind, text, opacity, position, color, scale, logo, activeIndex]);

  async function addFiles(files: File[]) {
    const errors: string[] = [];
    const next: WatermarkItem[] = [];
    for (const file of files) {
      const check = checkPhotoFile(file);
      if (!check.ok) {
        errors.push(check.reason ?? `${file.name}: 지원하지 않는 파일입니다.`);
        continue;
      }
      try {
        const decoded = await decodeImage(file);
        next.push({ id: `wm-${wmSeq++}`, file, previewUrl: URL.createObjectURL(file), width: decoded.width, height: decoded.height });
        decoded.close();
      } catch {
        errors.push(`${file.name}: 이미지를 읽을 수 없습니다.`);
      }
    }
    if (next.length) {
      setItems((prev) => [...prev, ...next]);
      setStatus(null);
      setResults((prev) => {
        for (const result of prev) URL.revokeObjectURL(result.url);
        return [];
      });
    }
    setError(errors.length ? errors.join(' ') : null);
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
    setActiveIndex((prev) => (prev >= index && prev > 0 ? prev - 1 : prev));
    setResults((prev) => {
      for (const result of prev) URL.revokeObjectURL(result.url);
      return [];
    });
    setStatus(null);
  }

  function clearAll() {
    setItems((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    setResults((prev) => {
      for (const result of prev) URL.revokeObjectURL(result.url);
      return [];
    });
    setActiveIndex(0);
    setStatus(null);
    setError(null);
  }

  async function pickLogo(files: File[]) {
    const file = files[0];
    if (!file) return;
    const check = checkPhotoFile(file, 10);
    if (!check.ok) {
      setError(check.reason ?? '로고 이미지를 사용할 수 없습니다.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      setError('로고 이미지를 읽을 수 없습니다.');
      return;
    }
    setLogo((prev) => {
      if (prev) URL.revokeObjectURL(prev.source.src);
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
    });
    setKind('logo');
    setError(null);
  }

  function clearLogo() {
    setLogo((prev) => {
      if (prev) URL.revokeObjectURL(prev.source.src);
      return null;
    });
  }

  async function applyAll() {
    if (!items.length) {
      setError('워터마크를 넣을 사진을 먼저 추가해 주세요.');
      return;
    }
    if (kind === 'text' && !text.trim()) {
      setError('워터마크 문구를 입력해 주세요.');
      return;
    }
    if (kind === 'logo' && !logo) {
      setError('로고 이미지를 선택해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(`${items.length}장에 적용하는 중…`);
    const next: WatermarkResult[] = [];
    try {
      for (const item of items) {
        let decoded: DecodedImage | null = null;
        try {
          decoded = await decodeImage(item.file);
          const ratio = Math.min(1, EXPORT_MAX / Math.max(decoded.width, decoded.height));
          const width = Math.max(1, Math.round(decoded.width * ratio));
          const height = Math.max(1, Math.round(decoded.height * ratio));
          const canvas = createCanvas(width, height);
          const ctx = context2d(canvas);
          const mime = item.file.type === 'image/png' || /\.png$/i.test(item.file.name) ? 'image/png' : 'image/jpeg';
          if (mime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(decoded.source, 0, 0, width, height);
          drawWatermark(ctx, width, height, spec);
          const blob = await canvasToBlob(canvas, mime, mime === 'image/png' ? undefined : 0.92);
          const name = suffixFileName(item.file.name, '워터마크', mime);
          next.push({ id: item.id, name, blob, url: URL.createObjectURL(blob), size: blob.size });
        } finally {
          decoded?.close();
        }
      }
      setResults((prev) => {
        for (const result of prev) URL.revokeObjectURL(result.url);
        return next;
      });
      setStatus(`${next.length}장에 워터마크를 적용했습니다. ZIP 또는 개별 다운로드로 저장하세요.`);
    } catch (err) {
      for (const result of next) URL.revokeObjectURL(result.url);
      setResults([]);
      setStatus(null);
      setError(err instanceof Error ? err.message : '워터마크를 적용하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    if (!results.length) return;
    try {
      const zip = await createZip(results.map((result) => ({ name: result.name, data: result.blob })));
      triggerDownload(zip, zipFileName('워터마크', results.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ZIP 파일을 만들지 못했습니다.');
    }
  }

  const active = items[activeIndex] ?? null;
  const activeResult = results.find((result) => result.id === active?.id) ?? null;

  return (
    <section className="panel" aria-labelledby="wm-title">
      <header className="panel-head">
        <h2 id="wm-title">워터마크</h2>
        <p className="panel-desc">내가 권리를 가진 사진에 문구나 로고를 넣어 여러 장을 한 번에 처리합니다. 원본 파일은 그대로 두고 사본을 만듭니다.</p>
      </header>

      <FileDropzone
        testId="wm"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        title="워터마크를 넣을 사진을 여러 장 끌어다 놓거나"
        buttonLabel="사진 선택 (여러 장)"
        hint="JPG · PNG · WebP · 여러 장 동시 선택 가능"
        onFiles={(files) => {
          void addFiles(files);
        }}
      />

      <ErrorAlert message={error} testId="wm-error" />

      {items.length > 0 && (
        <>
          <p className="field-label">
            사진 <span className="value-badge" data-testid="wm-count">{items.length}장</span>
            <span className="summary-sub">첫 장을 미리보기로 사용합니다</span>
          </p>
          <ul className="thumb-strip" data-testid="wm-list">
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`thumb${index === activeIndex ? ' thumb-active' : ''}`}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`${index + 1}번째 사진 미리보기`}
                  aria-pressed={index === activeIndex}
                  data-testid={`wm-thumb-${index}`}
                >
                  <img src={item.previewUrl} alt="" />
                  <span className="thumb-index">{index + 1}</span>
                </button>
                <button
                  type="button"
                  className="thumb-remove"
                  aria-label={`${index + 1}번째 사진 빼기`}
                  onClick={() => removeItem(index)}
                  data-testid={`wm-remove-${index}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Segmented<MarkKind>
        label="워터마크 종류"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'text', label: '텍스트', testId: 'wm-kind-text' },
          { value: 'logo', label: '로고 이미지', testId: 'wm-kind-logo' },
        ]}
      />

      {kind === 'text' ? (
        <div className="control-group">
          <label className="field-label" htmlFor="wm-text-input">
            문구
          </label>
          <input
            id="wm-text-input"
            className="input-single"
            type="text"
            value={text}
            maxLength={60}
            placeholder="예: @my_account · © 2026"
            onChange={(event) => setText(event.target.value)}
            data-testid="wm-text"
          />
        </div>
      ) : (
        <div className="control-group">
          <span className="field-label">로고 이미지</span>
          <input
            id="wm-logo-input"
            className="file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              void pickLogo(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
            data-testid="wm-logo-input"
          />
          <div className="row gap-s wrap">
            <label className="btn btn-ghost" htmlFor="wm-logo-input">
              로고 선택
            </label>
            {logo && (
              <button type="button" className="btn btn-ghost" onClick={clearLogo} data-testid="wm-logo-clear">
                로고 제거
              </button>
            )}
          </div>
          <p className="hint" data-testid="wm-logo-status">
            {logo ? `${logo.name} · ${logo.width}×${logo.height} (투명 PNG 권장)` : '로고 이미지를 아직 선택하지 않았습니다.'}
          </p>
        </div>
      )}

      <div className="control-group">
        <span className="field-label">위치</span>
        <div className="pos-grid" role="group" aria-label="워터마크 위치">
          {WATERMARK_POSITIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`pos-cell${position === item.value ? ' pos-cell-active' : ''}`}
              aria-pressed={position === item.value}
              onClick={() => setPosition(item.value)}
              data-testid={`wm-pos-${item.value}`}
            >
              <span className="pos-icon" aria-hidden="true">
                {item.short}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <RangeControl
        label="투명도"
        value={opacity}
        min={10}
        max={100}
        step={5}
        display={`${opacity}%`}
        onChange={setOpacity}
        testId="wm-opacity"
        scaleLeft="10% (은은하게)"
        scaleRight="100% (진하게)"
      />
      <RangeControl
        label="크기"
        value={scale}
        min={50}
        max={250}
        step={10}
        display={`${scale}%`}
        onChange={setScale}
        testId="wm-scale"
      />

      <div className="control-group">
        <span className="field-label">색상</span>
        <div className="row gap-s">
          <button
            type="button"
            className={`color-chip color-white${color === '#ffffff' ? ' color-chip-active' : ''}`}
            aria-pressed={color === '#ffffff'}
            onClick={() => setColor('#ffffff')}
            data-testid="wm-color-white"
          >
            흰색
          </button>
          <button
            type="button"
            className={`color-chip color-black${color === '#000000' ? ' color-chip-active' : ''}`}
            aria-pressed={color === '#000000'}
            onClick={() => setColor('#000000')}
            data-testid="wm-color-black"
          >
            검정
          </button>
        </div>
      </div>

      {active && (
        <div className="preview-wrap preview-wrap-tall">
          <canvas ref={canvasRef} className="watermark-canvas" data-testid="wm-canvas" aria-label="워터마크 미리보기" />
        </div>
      )}

      {items.length > 0 && (
        <div className="row gap-s wrap">
          <button type="button" className="btn btn-primary" onClick={() => void applyAll()} disabled={busy} data-testid="wm-apply">
            {busy ? '적용 중…' : `${items.length}장 모두 적용`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearAll} data-testid="wm-clear">
            목록 비우기
          </button>
        </div>
      )}

      {status && (
        <p className="hint hint-good" role="status" data-testid="wm-status">
          {status}
        </p>
      )}

      {results.length > 0 && (
        <div className="result-block" data-testid="wm-result">
          <p className="summary" data-testid="wm-result-count">
            {results.length}장 완료 · 총 {formatBytes(results.reduce((sum, result) => sum + result.size, 0))}
          </p>
          <button type="button" className="btn btn-primary btn-wide" onClick={() => void downloadZip()} data-testid="wm-download-all">
            ZIP으로 한 번에 받기
          </button>
          <ul className="download-list">
            {results.map((result, index) => (
              <li key={result.id}>
                <span className="file-name">{result.name}</span>
                <a className="page-dl" href={result.url} download={result.name} data-testid={`wm-download-${index}`}>
                  {formatBytes(result.size)} 저장
                </a>
              </li>
            ))}
          </ul>
          {activeResult && (
            <div className="preview-wrap">
              <img className="preview" src={activeResult.url} alt="워터마크 적용 결과" data-testid="wm-result-preview" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
