import { describe, expect, it } from 'vitest';
import { A4, A4_MARGIN, buildPdfFromImages, countPdfPages, pageLayoutFor, pdfFileName, type PdfImageSource } from './pdfImages';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z';

const png = new Uint8Array(Buffer.from(PNG_BASE64, 'base64'));
const jpeg = new Uint8Array(Buffer.from(JPEG_BASE64, 'base64'));

function source(mime: 'image/png' | 'image/jpeg', width: number, height: number, name: string): PdfImageSource {
  return { name, bytes: mime === 'image/png' ? png : jpeg, mime, width, height };
}

describe('pageLayoutFor', () => {
  it('사진 원본 크기 모드는 페이지 = 이미지 픽셀 크기(1px = 1pt)', () => {
    expect(pageLayoutFor(1600, 1200, 'image')).toEqual({ pageWidth: 1600, pageHeight: 1200, drawWidth: 1600, drawHeight: 1200, x: 0, y: 0 });
  });

  it('A4 모드는 세로 사진을 A4 세로에 여백을 두고 맞춘다', () => {
    const layout = pageLayoutFor(1000, 1500, 'a4');
    expect(layout.pageWidth).toBe(A4.width);
    expect(layout.pageHeight).toBe(A4.height);
    expect(layout.drawWidth).toBeLessThanOrEqual(A4.width - A4_MARGIN * 2 + 0.01);
    expect(layout.drawHeight).toBeCloseTo(A4.height - A4_MARGIN * 2, 1);
    expect(layout.x).toBeCloseTo((A4.width - layout.drawWidth) / 2, 3);
  });

  it('A4 모드는 가로 사진을 가로 페이지로 돌린다', () => {
    const layout = pageLayoutFor(1500, 1000, 'a4');
    expect(layout.pageWidth).toBe(A4.height);
    expect(layout.pageHeight).toBe(A4.width);
  });

  it('잘못된 크기는 오류', () => {
    expect(() => pageLayoutFor(0, 10, 'a4')).toThrow();
  });
});

describe('buildPdfFromImages', () => {
  it('입력한 순서대로 2페이지 PDF를 만든다(페이지 크기 = 이미지 크기)', async () => {
    const bytes = await buildPdfFromImages([source('image/png', 400, 300, 'a.png'), source('image/jpeg', 200, 100, 'b.jpg')], 'image');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(await countPdfPages(bytes)).toBe(2);

    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    expect(pages[0].getSize()).toEqual({ width: 400, height: 300 });
    expect(pages[1].getSize()).toEqual({ width: 200, height: 100 });
  });

  it('페이지 순서를 바꾸면 PDF 안의 순서도 바뀐다', async () => {
    const ordered = await buildPdfFromImages([source('image/png', 300, 300, 'a.png'), source('image/png', 500, 500, 'b.png')], 'image');
    const reversed = await buildPdfFromImages([source('image/png', 500, 500, 'b.png'), source('image/png', 300, 300, 'a.png')], 'image');
    const { PDFDocument } = await import('pdf-lib');
    const first = await PDFDocument.load(ordered);
    const second = await PDFDocument.load(reversed);
    expect(first.getPages()[0].getSize()).toEqual({ width: 300, height: 300 });
    expect(second.getPages()[0].getSize()).toEqual({ width: 500, height: 500 });
  });

  it('A4 모드도 실제 PDF로 만들어지고 페이지가 A4 크기다', async () => {
    const bytes = await buildPdfFromImages([source('image/jpeg', 1200, 900, 'a.jpg')], 'a4');
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const size = doc.getPages()[0].getSize();
    expect(size.width).toBeCloseTo(A4.height, 1);
    expect(size.height).toBeCloseTo(A4.width, 1);
  });

  it('이미지가 없으면 오류', async () => {
    await expect(buildPdfFromImages([], 'image')).rejects.toThrow('PDF로 만들 이미지가 없습니다');
  });
});

describe('pdfFileName', () => {
  it('장수와 시각이 들어간 파일명을 만든다', () => {
    const name = pdfFileName(3, new Date(2026, 10, 21, 13, 5));
    expect(name).toBe('pocket-tools-3장-20261121-1305.pdf');
  });
});
