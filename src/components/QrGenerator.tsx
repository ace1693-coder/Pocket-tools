import { useEffect, useRef, useState } from 'react';
import { qrFileName, renderQrToCanvas, validateQrInput } from '../lib/qr';
import { canCopyImage, copyImage, downloadBlobUrl } from '../lib/clipboard';

export default function QrGenerator() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function generate(value: string) {
    const invalid = validateQrInput(value);
    if (invalid) {
      setError(invalid);
      setImageUrl(null);
      setGeneratedText(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const dataUrl = await renderQrToCanvas(canvas, value);
      setImageUrl(dataUrl);
      setGeneratedText(value);
      setError(null);
    } catch (err) {
      setImageUrl(null);
      setGeneratedText(null);
      setError(err instanceof Error ? err.message : 'QR 코드를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  // 내용을 고치면 이미 만든 QR을 자동으로 갱신한다.
  useEffect(() => {
    if (generatedText === null) return;
    if (!text.trim()) return;
    const timer = window.setTimeout(() => {
      void generate(text);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function handleCopyImage() {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    if (!canCopyImage()) {
      setStatus('이 브라우저는 이미지 복사를 지원하지 않습니다. 아래 PNG 다운로드를 이용해 주세요.');
      return;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      setStatus('이미지를 만들지 못했습니다. PNG 다운로드를 이용해 주세요.');
      return;
    }
    const res = await copyImage(blob);
    setStatus(res.ok ? 'QR 이미지를 클립보드에 복사했습니다. 붙여넣기로 사용하세요.' : res.reason ?? '복사에 실패했습니다.');
  }

  async function handleDownload() {
    if (!imageUrl) return;
    // PNG 파일명으로 저장하기 위해 Blob URL을 새로 만든다.
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const url = URL.createObjectURL(blob);
      downloadBlobUrl(url, qrFileName(generatedText ?? 'code'));
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      downloadBlobUrl(imageUrl, qrFileName(generatedText ?? 'code'));
    }
  }

  return (
    <section className="panel" aria-labelledby="qr-title">
      <header className="panel-head">
        <h2 id="qr-title">QR 코드 만들기</h2>
        <p className="panel-desc">링크나 문구를 QR로 바꿔 고해상도 PNG로 저장합니다. 입력 내용은 밖으로 나가지 않습니다.</p>
      </header>

      <label className="field-label" htmlFor="qr-input">
        링크 또는 텍스트
      </label>
      <textarea
        id="qr-input"
        className="input-area mono"
        rows={3}
        placeholder="https://example.com 또는 전달할 문구"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setStatus('');
          if (!event.target.value.trim()) {
            setError(null);
          }
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-testid="qr-input"
      />

      <div className="row gap-s wrap">
        <button type="button" className="btn btn-primary" onClick={() => void generate(text)} data-testid="qr-generate-button">
          QR 만들기
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const sample = 'https://example.com/pocket-tools';
            setText(sample);
            setStatus('');
            void generate(sample);
          }}
          data-testid="qr-example-button"
        >
          예시 넣기
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setText('');
            setImageUrl(null);
            setGeneratedText(null);
            setError(null);
            setStatus('');
          }}
          data-testid="qr-reset-button"
        >
          초기화
        </button>
      </div>

      {error && (
        <p className="alert alert-error" role="alert" data-testid="qr-error">
          {error}
        </p>
      )}

      <div className="qr-stage">
        <canvas
          ref={canvasRef}
          id="qr-canvas"
          className={`qr-canvas${imageUrl ? '' : ' qr-canvas-hidden'}`}
          aria-label="생성된 QR 코드"
          data-testid="qr-canvas"
        />
        {!imageUrl && !error && (
          <p className="qr-placeholder" data-testid="qr-placeholder">
            내용을 입력하고 ‘QR 만들기’를 누르면 여기에 QR 코드가 나타납니다.
          </p>
        )}
        {!imageUrl && error && <p className="qr-placeholder">QR 코드가 여기에 표시됩니다.</p>}
      </div>

      {busy && (
        <p className="hint" role="status">
          QR 코드를 만드는 중…
        </p>
      )}

      {imageUrl && generatedText !== null && (
        <div className="result-block">
          <p className="hint" data-testid="qr-meta">
            {generatedText.length}자 · PNG 1024×1024
          </p>
          <button type="button" className="btn btn-primary btn-wide" onClick={() => void handleCopyImage()} data-testid="qr-copy-button">
            QR 이미지 복사
          </button>
          <button type="button" className="btn btn-ghost btn-wide" onClick={() => void handleDownload()} data-testid="qr-download">
            PNG 다운로드
          </button>
          <p className="sr-live" role="status" aria-live="polite" data-testid="qr-status">
            {status}
          </p>
          {status && <p className="hint">{status}</p>}
        </div>
      )}

      <details className="details">
        <summary>QR을 만들 수 없는 경우</summary>
        <p>내용이 1200자를 넘으면 QR 한 장에 담기지 않습니다. 핵심만 줄이거나 짧은 링크로 바꿔 주세요.</p>
        <p>이미지 복사는 브라우저가 Clipboard API를 지원할 때만 됩니다. 지원하지 않으면 PNG 다운로드를 사용하세요.</p>
      </details>
    </section>
  );
}
