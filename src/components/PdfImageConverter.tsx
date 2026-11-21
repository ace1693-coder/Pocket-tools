import { useEffect, useRef, useState } from 'react';
import { checkPhotoFile, decodeImage, mimeExtension, toArrayBuffer, triggerDownload } from '../lib/canvasImage';
import { formatBytes } from '../lib/format';
import { buildPdfFromImages, countPdfPages, pdfFileName, type PdfPageMode } from '../lib/pdfImages';
import { PDF_PAGE_LIMIT, describePdfError, openPdf, renderAllPages, type PdfHandle, type PdfImageFormat, type PdfPageImage } from '../lib/pdfRender';
import { prepareImageSource } from '../lib/pdfPrepare';
import { createZip, zipFileName } from '../lib/zip';
import { ErrorAlert, FileDropzone, Segmented } from './ui';

type Mode = 'toImage' | 'toPdf';

interface PdfInfo {
  numPages: number;
  title: string | null;
}

interface PdfSourceItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

interface PdfBuildResult {
  url: string;
  blob: Blob;
  size: number;
  pages: number;
  fileName: string;
}

let itemSeq = 0;

export default function PdfImageConverter() {
  const [mode, setMode] = useState<Mode>('toImage');

  /* ── 모드 A: PDF → 이미지 ── */
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [pages, setPages] = useState<PdfPageImage[]>([]);
  const [pdfFormat, setPdfFormat] = useState<PdfImageFormat>('image/png');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const pdfHandleRef = useRef<PdfHandle | null>(null);
  const pagesRef = useRef<PdfPageImage[]>([]);
  pagesRef.current = pages;
  const runRef = useRef(0);

  /* ── 모드 B: 이미지 → PDF ── */
  const [items, setItems] = useState<PdfSourceItem[]>([]);
  const [pageMode, setPageMode] = useState<PdfPageMode>('image');
  const [buildResult, setBuildResult] = useState<PdfBuildResult | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);
  const itemsRef = useRef<PdfSourceItem[]>([]);
  itemsRef.current = items;
  const buildResultRef = useRef<PdfBuildResult | null>(null);
  buildResultRef.current = buildResult;

  function revokePages(list: PdfPageImage[]) {
    for (const page of list) URL.revokeObjectURL(page.url);
  }

  useEffect(
    () => () => {
      revokePages(pagesRef.current);
      pdfHandleRef.current?.destroy();
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
      if (buildResultRef.current) URL.revokeObjectURL(buildResultRef.current.url);
    },
    // 언마운트 시점 정리만 수행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function renderFromBytes(bytes: Uint8Array, format: PdfImageFormat) {
    const runId = ++runRef.current;
    setPdfBusy(true);
    setPdfError(null);
    setPdfProgress('PDF를 읽는 중…');
    let handle: PdfHandle | null = null;
    try {
      handle = await openPdf(bytes);
      if (runId !== runRef.current) {
        handle.destroy();
        return;
      }
      pdfHandleRef.current?.destroy();
      pdfHandleRef.current = handle;
      setPdfInfo({ numPages: handle.numPages, title: handle.title });
      const rendered = await renderAllPages(handle, { format, targetWidth: 1240 }, (done, total) => {
        if (runId === runRef.current) setPdfProgress(`${done}/${total} 페이지 변환 중…`);
      });
      if (runId !== runRef.current) {
        revokePages(rendered);
        return;
      }
      setPages((prev) => {
        revokePages(prev);
        return rendered;
      });
      setPdfProgress(null);
    } catch (error) {
      if (runId !== runRef.current) return;
      setPages((prev) => {
        revokePages(prev);
        return [];
      });
      setPdfInfo(null);
      setPdfError(error instanceof Error ? error.message : describePdfError(error));
      setPdfProgress(null);
    } finally {
      if (runId === runRef.current) setPdfBusy(false);
    }
  }

  async function pickPdf(files: File[]) {
    const file = files[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pdf') && file.type !== 'application/pdf') {
      setPdfError('PDF 파일만 선택할 수 있습니다(.pdf). 이미지를 PDF로 만들려면 위의 "이미지 → PDF" 모드를 사용하세요.');
      return;
    }
    if (file.size === 0) {
      setPdfError('빈 파일입니다. 다른 PDF를 선택해 주세요.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setPdfError('파일이 너무 큽니다(100MB 초과). 100MB 이하 PDF를 선택해 주세요.');
      return;
    }
    setPdfName(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    pdfBytesRef.current = bytes;
    await renderFromBytes(bytes, pdfFormat);
  }

  async function changePdfFormat(format: PdfImageFormat) {
    setPdfFormat(format);
    if (pdfBytesRef.current) await renderFromBytes(pdfBytesRef.current, format);
  }

  function clearPdf() {
    runRef.current += 1;
    pdfBytesRef.current = null;
    pdfHandleRef.current?.destroy();
    pdfHandleRef.current = null;
    setPdfName(null);
    setPdfInfo(null);
    setPdfError(null);
    setPdfProgress(null);
    setPages((prev) => {
      revokePages(prev);
      return [];
    });
  }

  async function downloadZip() {
    if (!pages.length) return;
    try {
      const ext = mimeExtension(pdfFormat);
      const zip = await createZip(
        pages.map((page) => ({ name: `page-${String(page.pageNumber).padStart(3, '0')}.${ext}`, data: page.blob })),
      );
      const base = pdfName ? pdfName.replace(/\.pdf$/i, '') : 'pdf';
      triggerDownload(zip, zipFileName(`${base}-이미지`, pages.length));
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'ZIP 파일을 만들지 못했습니다.');
    }
  }

  /* ── 모드 B 핸들러 ── */
  async function addImages(files: File[]) {
    const errors: string[] = [];
    const next: PdfSourceItem[] = [];
    for (const file of files) {
      const check = checkPhotoFile(file);
      if (!check.ok) {
        errors.push(check.reason ?? `${file.name}: 지원하지 않는 파일입니다.`);
        continue;
      }
      try {
        const decoded = await decodeImage(file);
        next.push({
          id: `img-${itemSeq++}`,
          file,
          previewUrl: URL.createObjectURL(file),
          width: decoded.width,
          height: decoded.height,
        });
        decoded.close();
      } catch {
        errors.push(`${file.name}: 이미지를 읽을 수 없습니다.`);
      }
    }
    if (next.length) {
      setItems((prev) => [...prev, ...next]);
      setBuildResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setBuildStatus(null);
    }
    setBuildError(errors.length ? errors.join(' ') : null);
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
    setBuildResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
    setBuildResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function clearImages() {
    setItems((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    setBuildResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setBuildError(null);
    setBuildStatus(null);
  }

  async function buildPdf() {
    if (!items.length) {
      setBuildError('PDF로 만들 사진을 먼저 추가해 주세요.');
      return;
    }
    setBuildBusy(true);
    setBuildError(null);
    setBuildStatus('PDF를 만드는 중…');
    try {
      const sources = [];
      for (const item of items) sources.push(await prepareImageSource(item.file));
      const bytes = await buildPdfFromImages(sources, pageMode);
      const pages = await countPdfPages(bytes);
      const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' });
      const fileName = pdfFileName(pages);
      setBuildResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), blob, size: blob.size, pages, fileName };
      });
      setBuildStatus(`${pages}페이지 PDF를 만들었습니다.`);
    } catch (error) {
      setBuildResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setBuildError(error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.');
      setBuildStatus(null);
    } finally {
      setBuildBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="pdf-title">
      <header className="panel-head">
        <h2 id="pdf-title">PDF ↔ 이미지</h2>
        <p className="panel-desc">PDF 각 페이지를 사진으로 바꾸거나, 여러 장의 사진을 순서대로 한 PDF로 묶습니다. 파일은 기기 밖으로 나가지 않습니다.</p>
      </header>

      <Segmented<Mode>
        label="모드"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'toImage', label: 'PDF → 이미지', testId: 'pdf-mode-to-image' },
          { value: 'toPdf', label: '이미지 → PDF', testId: 'pdf-mode-to-pdf' },
        ]}
      />

      {mode === 'toImage' ? (
        <>
          <FileDropzone
            testId="pdf"
            accept="application/pdf,.pdf"
            title="PDF 파일을 끌어다 놓거나"
            buttonLabel="PDF 선택"
            hint="PDF 1개 · 최대 100MB · 최대 50페이지"
            onFiles={pickPdf}
          />

          <ErrorAlert message={pdfError} testId="pdf-error" />

          {pdfName && (
            <p className="file-info" data-testid="pdf-file-info">
              <span className="file-name">{pdfName}</span>
              <span className="file-meta">{pdfInfo ? `${pdfInfo.numPages}페이지` : 'PDF'}</span>
            </p>
          )}

          {pdfProgress && (
            <p className="hint hint-live" role="status" data-testid="pdf-progress">
              {pdfProgress}
            </p>
          )}

          {pdfBusy && !pdfProgress && (
            <p className="hint" role="status" data-testid="pdf-busy">
              변환 중…
            </p>
          )}

          <Segmented<PdfImageFormat>
            label="이미지 형식"
            value={pdfFormat}
            onChange={(value) => {
              void changePdfFormat(value);
            }}
            options={[
              { value: 'image/png', label: 'PNG (선명)', testId: 'pdf-format-png' },
              { value: 'image/jpeg', label: 'JPEG (가벼움)', testId: 'pdf-format-jpeg' },
            ]}
          />

          {pdfInfo && (
            <p className="summary" data-testid="pdf-page-count">
              {pdfInfo.numPages}페이지를 {pdfFormat === 'image/png' ? 'PNG' : 'JPEG'}로 변환
              {pdfInfo.numPages > PDF_PAGE_LIMIT ? ` (앞 ${PDF_PAGE_LIMIT}페이지)` : ''}
              {pdfInfo.title ? ` · “${pdfInfo.title}”` : ''}
            </p>
          )}

          {pages.length > 0 && (
            <div className="page-grid" data-testid="pdf-results">
              {pages.map((page) => (
                <figure className="page-card" key={page.pageNumber} data-testid={`pdf-page-${page.pageNumber}`}>
                  <div className="page-thumb">
                    <img src={page.url} alt={`${page.pageNumber}페이지`} loading="lazy" />
                  </div>
                  <figcaption>
                    <span>
                      {page.pageNumber}쪽 · {page.width}×{page.height}
                    </span>
                    <a
                      className="page-dl"
                      href={page.url}
                      download={`${(pdfName ?? 'pdf').replace(/\.pdf$/i, '')}-${String(page.pageNumber).padStart(3, '0')}.${mimeExtension(
                        pdfFormat,
                      )}`}
                      data-testid={`pdf-page-download-${page.pageNumber}`}
                    >
                      저장
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {pages.length > 0 && (
            <div className="row gap-s wrap">
              <button type="button" className="btn btn-primary" onClick={downloadZip} data-testid="pdf-download-all">
                전체 ZIP 다운로드 ({pages.length}장)
              </button>
              <button type="button" className="btn btn-ghost" onClick={clearPdf} data-testid="pdf-clear">
                다른 PDF 선택
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <FileDropzone
            testId="pdfimg"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            title="PDF로 묶을 사진을 여러 장 끌어다 놓거나"
            buttonLabel="사진 선택 (여러 장)"
            hint="JPG · PNG · WebP · 추가한 순서대로 페이지가 됩니다"
            onFiles={(files) => {
              void addImages(files);
            }}
          />

          <ErrorAlert message={buildError} testId="pdfimg-error" />

          {items.length > 0 && (
            <>
              <p className="field-label">
                페이지 순서 <span className="value-badge" data-testid="pdfimg-count">{items.length}장</span>
              </p>
              <ol className="page-list" data-testid="pdfimg-list">
                {items.map((item, index) => (
                  <li className="page-row" key={item.id} data-testid={`pdfimg-row-${index}`}>
                    <span className="page-num">{index + 1}</span>
                    <img className="page-row-thumb" src={item.previewUrl} alt="" />
                    <span className="page-row-name" data-testid={`pdfimg-name-${index}`}>
                      {item.file.name}
                      <span className="page-row-meta">
                        {item.width}×{item.height} · {formatBytes(item.file.size)}
                      </span>
                    </span>
                    <span className="page-row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`${index + 1}번째 페이지 위로`}
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        data-testid={`pdfimg-move-up-${index}`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`${index + 1}번째 페이지 아래로`}
                        onClick={() => moveItem(index, 1)}
                        disabled={index === items.length - 1}
                        data-testid={`pdfimg-move-down-${index}`}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        aria-label={`${index + 1}번째 페이지 삭제`}
                        onClick={() => removeItem(index)}
                        data-testid={`pdfimg-remove-${index}`}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ol>

              <Segmented<PdfPageMode>
                label="페이지 크기"
                value={pageMode}
                onChange={(value) => {
                  setPageMode(value);
                  setBuildResult((prev) => {
                    if (prev) URL.revokeObjectURL(prev.url);
                    return null;
                  });
                }}
                options={[
                  { value: 'image', label: '사진 원본 크기', testId: 'pdfimg-mode-image' },
                  { value: 'a4', label: 'A4 여백 맞춤', testId: 'pdfimg-mode-a4' },
                ]}
              />

              <div className="row gap-s wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    void buildPdf();
                  }}
                  disabled={buildBusy}
                  data-testid="pdfimg-generate"
                >
                  {buildBusy ? 'PDF 만드는 중…' : 'PDF 만들기'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={clearImages} data-testid="pdfimg-clear">
                  목록 비우기
                </button>
              </div>
            </>
          )}

          {buildStatus && (
            <p className="hint hint-good" role="status" data-testid="pdfimg-status">
              {buildStatus}
            </p>
          )}

          {buildResult && (
            <div className="result-block" data-testid="pdfimg-result">
              <p className="summary" data-testid="pdfimg-page-count">
                {buildResult.pages}페이지 · {formatBytes(buildResult.size)}
              </p>
              <a className="btn btn-primary btn-wide" href={buildResult.url} download={buildResult.fileName} data-testid="pdfimg-download">
                PDF 다운로드
              </a>
              <p className="hint">방금 만든 PDF를 위의 “PDF → 이미지” 모드에 올리면 페이지를 다시 이미지로 바꿀 수 있습니다.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
