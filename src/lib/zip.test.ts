import { describe, expect, it } from 'vitest';
import { createZip, uniqueFileNames, zipFileName } from './zip';

describe('uniqueFileNames', () => {
  it('중복 이름에 번호를 붙인다', () => {
    expect(uniqueFileNames(['a.jpg', 'a.jpg', 'a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'a (2).jpg', 'a (3).jpg', 'b.jpg']);
    expect(uniqueFileNames(['확장자없음', '확장자없음'])).toEqual(['확장자없음', '확장자없음 (2)']);
  });
});

describe('createZip', () => {
  it('실제 ZIP을 만들고 항목 이름·내용이 보존된다', async () => {
    const encoder = new TextEncoder();
    const blob = await createZip([
      { name: 'first.txt', data: encoder.encode('첫 번째 파일') },
      { name: 'second.txt', data: new Blob([encoder.encode('second file')]) },
    ]);
    expect(blob.size).toBeGreaterThan(100);

    const { default: JSZip } = await import('jszip');
    const loaded = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(loaded.files).sort();
    expect(names).toEqual(['first.txt', 'second.txt']);
    expect(await loaded.file('first.txt')?.async('string')).toBe('첫 번째 파일');
    expect(await loaded.file('second.txt')?.async('string')).toBe('second file');
  });

  it('중복 파일명은 ZIP 안에서도 구분된다', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const blob = await createZip([
      { name: 'same.png', data },
      { name: 'same.png', data },
    ]);
    const { default: JSZip } = await import('jszip');
    const loaded = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(loaded.files).sort()).toEqual(['same (2).png', 'same.png']);
  });

  it('빈 목록이면 오류', async () => {
    await expect(createZip([])).rejects.toThrow();
  });
});

describe('zipFileName', () => {
  it('장수와 시각이 들어간 ZIP 이름', () => {
    expect(zipFileName('워터마크', 3, new Date(2026, 10, 21, 9, 7))).toBe('워터마크-3장-20261121-0907.zip');
  });
});
