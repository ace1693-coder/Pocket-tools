/** 이미지 → PDF 실제 생성 (pdf-lib). 순수 함수라 단위 테스트에서 바로 검증할 수 있다. */
// pdf-lib은 무거우므로 이 도구를 실제로 쓸 때만 동적 import 한다(초기 로딩 가볍게).
type PdfLib = typeof import('pdf-lib');
let cached: Promise<PdfLib> | null = null;
function loadPdfLib(): Promise<PdfLib> {
  cached ??= import('pdf-lib');
  return cached;
}

export type PdfPageMode = 'image' | 'a4';

export const A4 = { width: 595.28, height: 841.89 };
export const A4_MARGIN = 24;

export interface PdfImageSource {
  name: string;
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

export interface PdfPageLayout {
  pageWidth: number;
  pageHeight: number;
  drawWidth: number;
  drawHeight: number;
  x: number;
  y: number;
}

/** 페이지 모드별 페이지 크기와 이미지 배치 */
export function pageLayoutFor(width: number, height: number, mode: PdfPageMode, margin = A4_MARGIN): PdfPageLayout {
  if (!(width > 0) || !(height > 0)) throw new Error('이미지 크기를 읽을 수 없습니다.');
  if (mode === 'image') {
    return { pageWidth: width, pageHeight: height, drawWidth: width, drawHeight: height, x: 0, y: 0 };
  }
  const landscape = width > height;
  const pageWidth = landscape ? A4.height : A4.width;
  const pageHeight = landscape ? A4.width : A4.height;
  const scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  return {
    pageWidth,
    pageHeight,
    drawWidth,
    drawHeight,
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
  };
}

/** 이미지들을 입력한 순서대로 페이지에 담아 PDF 바이트를 만든다. */
export async function buildPdfFromImages(sources: PdfImageSource[], mode: PdfPageMode): Promise<Uint8Array> {
  if (!sources.length) throw new Error('PDF로 만들 이미지가 없습니다. 사진을 먼저 추가해 주세요.');
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.create();
  doc.setTitle('Pocket Tools 이미지 PDF');
  doc.setCreator('Pocket Tools');
  doc.setProducer('Pocket Tools (pdf-lib)');

  for (const source of sources) {
    const image = source.mime === 'image/png' ? await doc.embedPng(source.bytes) : await doc.embedJpg(source.bytes);
    const layout = pageLayoutFor(source.width, source.height, mode);
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawImage(image, {
      x: layout.x,
      y: layout.y,
      width: layout.drawWidth,
      height: layout.drawHeight,
    });
  }

  return doc.save();
}

/** 생성된 PDF의 페이지 수(검증·표시용) */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

export function pdfFileName(count: number, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `pocket-tools-${count}장-${stamp}.pdf`;
}
