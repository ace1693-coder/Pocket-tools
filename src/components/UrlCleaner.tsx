import { useState } from 'react';
import { cleanUrl, shorten, type CleanOutcome } from '../lib/urlCleaner';
import { copyText } from '../lib/clipboard';

const TRACKING_EXAMPLE =
  'https://shop.example.com/item/4821?utm_source=instagram&utm_medium=social&utm_campaign=fall_sale&fbclid=IwAR2abcDEF&id=4821&page=2&igshid=Zjc2ZTc4Nzk%3D#review';

const SIGNED_EXAMPLE =
  'https://cdn.example.com/report.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20261121%2Fap-northeast-2%2Fs3%2Faws4_request&X-Amz-Date=20261121T040000Z&X-Amz-Expires=600&X-Amz-Signature=9f8a7b6c5d4e3f2a1b0c&X-Amz-SignedHeaders=host&utm_source=newsletter&utm_campaign=winter';

export default function UrlCleaner() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CleanOutcome | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'fail'>('idle');

  function run(value: string) {
    setCopyState('idle');
    setResult(cleanUrl(value));
  }

  function loadExample(example: string) {
    setInput(example);
    run(example);
  }

  async function handleCopy() {
    if (!result || !result.ok) return;
    const res = await copyText(result.cleaned);
    setCopyState(res.ok ? 'done' : 'fail');
  }

  return (
    <section className="panel" aria-labelledby="url-title">
      <header className="panel-head">
        <h2 id="url-title">URL 추적 파라미터 제거</h2>
        <p className="panel-desc">공유 링크에 붙은 광고·추적 꼬리표만 지웁니다. 상품 번호·서명·인증 값은 그대로 둡니다.</p>
      </header>

      <label className="field-label" htmlFor="url-input">
        URL 붙여넣기
      </label>
      <textarea
        id="url-input"
        className="input-area mono"
        rows={4}
        placeholder="https://example.com/page?utm_source=...&fbclid=..."
        value={input}
        onChange={(event) => {
          setInput(event.target.value);
          setCopyState('idle');
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-testid="url-input"
      />

      <div className="row gap-s wrap">
        <button type="button" className="btn btn-primary" onClick={() => run(input)} data-testid="url-clean-button">
          정리하기
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => loadExample(TRACKING_EXAMPLE)} data-testid="url-example-button">
          예시 넣기
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => loadExample(SIGNED_EXAMPLE)}
          data-testid="url-signed-example-button"
        >
          서명 URL 예시
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setInput('');
            setResult(null);
            setCopyState('idle');
          }}
          data-testid="url-reset-button"
        >
          초기화
        </button>
      </div>

      {result && !result.ok && (
        <p className="alert alert-error" role="alert" data-testid="url-error">
          {result.error}
        </p>
      )}

      {result && result.ok && (
        <div className="result-block" data-testid="url-result">
          <p className={result.removedCount > 0 ? 'summary summary-good' : 'summary'} data-testid="url-summary">
            {result.removedCount > 0
              ? `추적 파라미터 ${result.removedCount}개를 제거했습니다.`
              : '제거할 추적 파라미터가 없습니다. URL이 이미 깨끗합니다.'}
            {result.kept.length > 0 && <span className="summary-sub"> 필수 파라미터 {result.kept.length}개는 그대로 보존했습니다.</span>}
          </p>

          {result.removedCount > 0 && (
            <ul className="chip-list" aria-label="제거된 파라미터 목록" data-testid="url-removed-list">
              {result.removed.map((param, index) => (
                <li key={`${param.key}-${index}`} className="chip chip-removed">
                  <span className="chip-key">{param.key}</span>
                  {param.value && <span className="chip-value">{shorten(param.value, 28)}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="compare">
            <div className="compare-box">
              <span className="compare-title">원본</span>
              <p className="mono url-text" data-testid="url-original">
                {result.original}
              </p>
            </div>
            <div className="compare-box compare-box-accent">
              <span className="compare-title">정리된 URL</span>
              <p className="mono url-text" data-testid="url-cleaned">
                {result.cleaned}
              </p>
            </div>
          </div>

          {result.protocolAdded && <p className="hint">주소에 https:// 를 붙여서 정리했습니다.</p>}

          <button type="button" className="btn btn-primary btn-wide" onClick={handleCopy} data-testid="url-copy-button">
            {copyState === 'done' ? '복사했습니다 ✓' : '정리된 URL 복사'}
          </button>
          <p className="sr-live" role="status" aria-live="polite">
            {copyState === 'done' ? '정리된 URL을 클립보드에 복사했습니다.' : copyState === 'fail' ? '복사에 실패했습니다. URL을 길게 눌러 직접 복사해 주세요.' : ''}
          </p>
          {copyState === 'fail' && (
            <p className="alert alert-error" role="alert">
              복사에 실패했습니다. 브라우저 권한을 확인하거나 정리된 URL을 길게 눌러 직접 복사해 주세요.
            </p>
          )}
        </div>
      )}

      <details className="details">
        <summary>어떤 파라미터를 지우나요?</summary>
        <p>
          utm_*, fbclid, gclid, yclid, mc_cid, mc_eid, igshid, igsh, si, ref_src, spm, _ga, _gl, mkt_tok, vero_id 등 광고·유입
          분석용 꼬리표를 지웁니다.
        </p>
        <p>
          반대로 v, id, page, q, query, search, tab, sort, code, state, token, Signature, X-Amz-*, Expires, Policy, Key-Pair-Id 같은
          콘텐츠 식별·서명·인증 값은 절대 지우지 않습니다. 이름이 겹치면 보존이 우선입니다.
        </p>
      </details>
    </section>
  );
}
