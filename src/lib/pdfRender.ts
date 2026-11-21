/**
 * PDF → 이미지 실제 렌더링 (pdf.js). 워커·폰트·CMap은 모두 이 앱의 로컬 정적 자산(./pdfjs/)에서만 읽는다.
 * 외부 CDN을 전혀 참조하지 않으므로 오프라인에서도 동작한다.
 */
import { canvasToBlob, createCanvas, context2d } from './canvasImage';

// pdf.js는 1MB가 넘으므로 PDF 도구를 실제로 쓸 때만 불러온다.
type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist');
  return pdfjsPromise;
}

export type PdfImageFormat = 'image/png' | 'image/jpeg';

export interface PdfPageImage {
  pageNumber: number;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

export interface RenderOptions {
  format: PdfImageFormat;
  quality?: number;
  /** 렌더링 목표 폭(px). 페이지 비율에 따라 높이가 정해진다. */
  targetWidth?: number;
}

export interface PdfHandle {
  numPages: number;
  title: string | null;
  renderPage(pageNumber: number, options: RenderOptions): Promise<Omit<PdfPageImage, 'url'>>;
  destroy(): void;
}

export const PDF_PAGE_LIMIT = 50;

function assetBase(): string {
  return new URL('pdfjs/', document.baseURI).href;
}

let workerConfigured = false;
function configurePdfWorker(pdfjsLib: PdfJs): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${assetBase()}pdf.worker.min.mjs`;
  workerConfigured = true;
}

/** pdf.js 예외를 사용자용 한국어 안내로 바꾼다. */
export function describePdfError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (name === 'PasswordException' || /password/i.test(message)) {
    return '암호(비밀번호)가 설정된 PDF입니다. 암호를 해제한 파일을 다시 선택해 주세요.';
  }
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) {
    return 'PDF 파일이 손상되었거나 PDF 형식이 아닙니다. 다른 파일을 선택해 주세요.';
  }
  if (name === 'MissingPDFException') {
    return 'PDF 내용이 비어 있습니다. 다른 파일을 선택해 주세요.';
  }
  if (/worker/i.test(message)) {
    return 'PDF 처리 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';
  }
  if (name === 'ResponseException' || /network/i.test(message)) {
    return 'PDF를 읽는 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.';
  }
  return 'PDF를 여는 중 오류가 발생했습니다. 다른 파일을 선택해 주세요.';
}

export async function openPdf(bytes: Uint8Array): Promise<PdfHandle> {
  const pdfjsLib = await loadPdfJs();
  configurePdfWorker(pdfjsLib);
  const base = assetBase();
  const task = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  let doc: Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
  try {
    doc = await task.promise;
  } catch (error) {
    try {
      await task.destroy();
    } catch {
      /* 이미 종료된 작업 */
    }
    throw new Error(describePdfError(error));
  }

  let title: string | null = null;
  try {
    const metadata = await doc.getMetadata();
    const info = metadata.info as { Title?: unknown } | undefined;
    if (info && typeof info.Title === 'string' && info.Title.trim()) title = info.Title.trim();
  } catch {
    title = null;
  }

  return {
    numPages: doc.numPages,
    title,
    async renderPage(pageNumber, options) {
      const page = await doc.getPage(pageNumber);
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = options.targetWidth ?? 1240;
        const scale = Math.min(3, Math.max(0.5, targetWidth / baseViewport.width));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = context2d(canvas);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, viewport }).promise;
        const blob = await canvasToBlob(canvas, options.format, options.format === 'image/jpeg' ? (options.quality ?? 0.92) : undefined);
        return { pageNumber, blob, width: canvas.width, height: canvas.height };
      } finally {
        page.cleanup();
      }
    },
    destroy() {
      doc.destroy().catch(() => {
        /* 정리 실패는 무시 */
      });
    },
  };
}

/** 모든 페이지를 순서대로 렌더링한다(최대 PDF_PAGE_LIMIT 페이지). */
export async function renderAllPages(
  handle: PdfHandle,
  options: RenderOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfPageImage[]> {
  const total = Math.min(handle.numPages, PDF_PAGE_LIMIT);
  const pages: PdfPageImage[] = [];
  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const rendered = await handle.renderPage(pageNumber, options);
    pages.push({ ...rendered, url: URL.createObjectURL(rendered.blob) });
    onProgress?.(pageNumber, total);
  }
  return pages;
}
