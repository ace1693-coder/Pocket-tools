import { useEffect, useRef, useState } from 'react';
import { checkPhotoFile, canvasToBlob, context2d, createCanvas, decodeImage, suffixFileName, type DecodedImage } from '../lib/canvasImage';
import { formatBytes } from '../lib/format';
import { formatGps, readExif, verifyNoExif, type ExifReport, type StripVerification } from '../lib/exif';
import { applyMosaic, isRegionTooSmall, normalizeRegion, regionsToPixels, strengthToBlock, type NormalRegion } from '../lib/mosaic';
import { ErrorAlert, FileDropzone, RangeControl, Segmented } from './ui';

interface MosaicResult {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  size: number;
  verification: StripVerification;
}

type OutputFormat = 'image/jpeg' | 'image/png';

const PREVIEW_MAX = 1100;

export default function ExifMosaic() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ExifReport | null>(null);
  const [regions, setRegions] = useState<NormalRegion[]>([]);
  const [strength, setStrength] = useState(35);
  const [format, setFormat] = useState<OutputFormat>('image/jpeg');
  const [result, setResult] = useState<MosaicResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decodedRef = useRef<DecodedImage | null>(null);
  // 드래그 중 좌표는 ref로도 들고 있어, 한 틱에 여러 포인터 이벤트가 와도 정확히 누적된다.
  const dragRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const resultRef = useRef<MosaicResult | null>(null);
  resultRef.current = result;

  useEffect(
    () => () => {
      decodedRef.current?.close();
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );

  /* 미리보기 캔버스 다시 그리기 */
  useEffect(() => {
    const canvas = canvasRef.current;
    const decoded = decodedRef.current;
    if (!canvas || !decoded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    if (regions.length) {
      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyMosaic(
        { data: snapshot.data, width: snapshot.width, height: snapshot.height },
        regionsToPixels(regions, canvas.width, canvas.height),
        strengthToBlock(strength, canvas.width),
      );
      ctx.putImageData(snapshot, 0, 0);
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(76, 155, 255, 0.95)';
    for (const region of regions) {
      ctx.strokeRect(region.x * canvas.width, region.y * canvas.height, region.w * canvas.width, region.h * canvas.height);
    }
    if (drag) {
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
      ctx.strokeRect(
        Math.min(drag.x1, drag.x2),
        Math.min(drag.y1, drag.y2),
        Math.abs(drag.x2 - drag.x1),
        Math.abs(drag.y2 - drag.y1),
      );
      ctx.restore();
    }
  }, [regions, strength, drag, report]);

  /* 모자이크 영역·강도·형식이 바뀌면 이전 저장 결과(검증 증빙)는 더 이상 현재 설정의 결과가 아니므로 지운다. */
  useEffect(() => {
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, [regions, strength, format]);

  async function pick(files: File[]) {
    const next = files[0];
    if (!next) return;
    const check = checkPhotoFile(next);
    if (!check.ok) {
      setError(check.reason ?? '지원하지 않는 파일입니다.');
      return;
    }
    setError(null);
    setBusy(true);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setRegions([]);
    try {
      decodedRef.current?.close();
      decodedRef.current = null;
      const decoded = await decodeImage(next);
      decodedRef.current = decoded;
      const scale = Math.min(1, PREVIEW_MAX / Math.max(decoded.width, decoded.height));
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = Math.max(1, Math.round(decoded.width * scale));
        canvas.height = Math.max(1, Math.round(decoded.height * scale));
      }
      const parsed = await readExif(next);
      setReport(parsed);
      setFile(next);
    } catch (err) {
      setFile(null);
      setReport(null);
      setError(err instanceof Error ? err.message : '사진을 읽지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    decodedRef.current?.close();
    decodedRef.current = null;
    setFile(null);
    setReport(null);
    setRegions([]);
    setError(null);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function toCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
    return { x: Math.max(0, Math.min(canvas.width, x)), y: Math.max(0, Math.min(canvas.height, y)) };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!file) return;
    const point = toCanvasPoint(event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 합성 이벤트 등 캡처가 불가능한 환경 */
    }
    dragRef.current = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    setDrag(dragRef.current);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = dragRef.current;
    if (!current) return;
    const point = toCanvasPoint(event);
    dragRef.current = { ...current, x2: point.x, y2: point.y };
    setDrag(dragRef.current);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = dragRef.current;
    if (!current) return;
    const canvas = event.currentTarget;
    const point = toCanvasPoint(event);
    const region = normalizeRegion(current.x1, current.y1, point.x, point.y, canvas.width, canvas.height);
    if (!isRegionTooSmall(region, canvas.width, canvas.height)) {
      setRegions((prev) => [...prev, region]);
    }
    dragRef.current = null;
    setDrag(null);
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* 캡처 없이 종료된 경우 */
    }
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    setError(null);
    let decoded: DecodedImage | null = null;
    try {
      decoded = await decodeImage(file);
      const canvas = createCanvas(decoded.width, decoded.height);
      const ctx = context2d(canvas);
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      if (regions.length) {
        const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyMosaic(
          { data: snapshot.data, width: snapshot.width, height: snapshot.height },
          regionsToPixels(regions, canvas.width, canvas.height),
          strengthToBlock(strength, canvas.width),
        );
        ctx.putImageData(snapshot, 0, 0);
      }
      const blob = await canvasToBlob(canvas, format, format === 'image/jpeg' ? 0.92 : undefined);
      // 저장 직전 결과 바이트를 다시 EXIF 파서·세그먼트 스캐너에 넣어 완전 제거를 검증한다.
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const verification = await verifyNoExif(bytes);

      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), blob, width: canvas.width, height: canvas.height, size: blob.size, verification };
      });
      if (!verification.ok) setError('결과 파일에서 메타데이터가 완전히 제거되지 않았습니다. 다른 형식(PNG)으로 다시 저장해 주세요.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      decoded?.close();
      setBusy(false);
    }
  }

  const downloadName = file && result ? suffixFileName(file.name, '모자이크-EXIF제거', format) : 'mosaic.jpg';

  return (
    <section className="panel" aria-labelledby="exif-title">
      <header className="panel-head">
        <h2 id="exif-title">EXIF 제거 · 모자이크</h2>
        <p className="panel-desc">사진에 숨어 있는 촬영 위치(GPS)·카메라 정보를 확인하고, 가리고 싶은 부분을 직접 칠해 지운 뒤 메타데이터까지 지워서 저장합니다.</p>
      </header>

      <FileDropzone
        testId="exif"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        title="사진을 끌어다 놓거나"
        buttonLabel="사진 선택"
        hint="JPG · PNG · WebP · 최대 40MB"
        onFiles={pick}
      />

      <ErrorAlert message={error} testId="exif-error" />

      {file && (
        <p className="file-info" data-testid="exif-file-info">
          <span className="file-name">{file.name}</span>
          <span className="file-meta">{formatBytes(file.size)}</span>
        </p>
      )}

      {report && (
        <div className="result-block" data-testid="exif-info">
          <p className="summary" data-testid="exif-summary">
            {report.hasMetadata ? `메타데이터 ${report.tagCount}개 항목 발견` : 'EXIF 메타데이터 없음'}
            <span className="summary-sub"> · {report.fileKind.toUpperCase()}</span>
          </p>

          {report.hasMetadata ? (
            <dl className="stats stats-3" data-testid="exif-facts">
              <div>
                <dt>위치(GPS)</dt>
                <dd className={report.gps ? 'stat-warn' : 'stat-good'} data-testid="exif-gps">
                  {report.gps ? formatGps(report.gps) : '없음'}
                </dd>
              </div>
              <div>
                <dt>카메라</dt>
                <dd data-testid="exif-camera">{[report.make, report.model].filter(Boolean).join(' ') || (report.lens ?? '없음')}</dd>
              </div>
              <div>
                <dt>촬영 일시</dt>
                <dd data-testid="exif-date">{report.dateTimeOriginal ?? '없음'}</dd>
              </div>
            </dl>
          ) : (
            <p className="alert alert-ok" data-testid="exif-none">
              이 사진에는 EXIF(위치·카메라·촬영일시) 정보가 없습니다. PNG처럼 원래 메타데이터가 없는 이미지이며, 저장해도 메타데이터는 생기지 않습니다.
            </p>
          )}

          {report.tags.length > 0 && (
            <ul className="tag-list" data-testid="exif-tags">
              {report.tags.slice(0, 14).map((tag) => (
                <li key={tag.key}>
                  <span className="tag-key">{tag.label}</span>
                  <span className="tag-value">{tag.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {file && (
        <>
          <div className="control-group">
            <span className="field-label">
              모자이크 영역 <span className="value-badge" data-testid="exif-region-count">{regions.length}개</span>
            </span>
            <div className="mosaic-stage">
              <canvas
                ref={canvasRef}
                className="mosaic-canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setDrag(null);
                }}
                data-testid="exif-canvas"
              />
              {regions.length === 0 && !drag && (
                <p className="mosaic-hint" aria-hidden="true">
                  사진 위를 드래그해 가릴 곳을 지정하세요
                </p>
              )}
            </div>
            <p className="hint">손가락 또는 마우스로 드래그하면 그 영역이 모자이크 처리됩니다. 여러 곳을 이어서 지정할 수 있어요.</p>
          </div>

          <RangeControl
            label="모자이크 강도"
            value={strength}
            min={5}
            max={100}
            step={5}
            display={`${strength}%`}
            onChange={setStrength}
            testId="exif-strength"
            scaleLeft="약하게"
            scaleRight="강하게"
          />

          <div className="row gap-s wrap">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRegions((prev) => prev.slice(0, -1))}
              disabled={regions.length === 0}
              data-testid="exif-undo"
            >
              되돌리기
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRegions([])}
              disabled={regions.length === 0}
              data-testid="exif-clear"
            >
              전체 초기화
            </button>
          </div>

          <Segmented<OutputFormat>
            label="저장 형식"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'image/jpeg', label: 'JPEG', testId: 'exif-format-jpeg' },
              { value: 'image/png', label: 'PNG', testId: 'exif-format-png' },
            ]}
            hint="저장할 때 사진을 새로 인코딩하므로 원본 EXIF가 모두 사라집니다. 저장 직전에 결과 바이트를 다시 검사해 확인합니다."
          />

          <button type="button" className="btn btn-primary btn-wide" onClick={() => void save()} disabled={busy} data-testid="exif-save">
            {busy ? '저장 준비 중…' : 'EXIF 제거 + 모자이크 저장'}
          </button>
        </>
      )}

      {result && (
        <div className="result-block" data-testid="exif-result">
          <div className="preview-wrap">
            <img className="preview" src={result.url} alt="저장 결과 미리보기" data-testid="exif-preview" />
          </div>

          <div className={`verify-box${result.verification.ok ? ' verify-ok' : ' verify-fail'}`} data-testid="exif-verify">
            <p className="summary" data-testid="exif-verify-summary">
              {result.verification.ok ? '✓ 메타데이터 완전 제거 확인' : '✕ 메타데이터가 남아 있습니다'} · EXIF {result.verification.exifSegments}건 · GPS{' '}
              {result.verification.gpsTagCount}건 · 카메라 {result.verification.cameraTagCount}건
            </p>
            <ul className="verify-lines" data-testid="exif-verify-lines">
              {result.verification.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <p className="hint" data-testid="exif-result-meta">
            {result.width}×{result.height} · {formatBytes(result.size)} · {format === 'image/png' ? 'PNG' : 'JPEG'} 재인코딩
          </p>

          <a
            className="btn btn-primary btn-wide"
            href={result.url}
            download={downloadName}
            aria-disabled={!result.verification.ok}
            data-testid="exif-download"
          >
            검증된 사진 다운로드
          </a>
          <button type="button" className="btn btn-ghost btn-wide" onClick={reset} data-testid="exif-reset">
            다른 사진 선택
          </button>
        </div>
      )}
    </section>
  );
}
