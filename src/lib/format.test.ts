import { describe, expect, it } from 'vitest';
import { formatBytes, formatExtension, formatPercent, savingsPercent } from './format';
import { checkImageFile, outputFileName } from './imageCompress';
import { qrFileName, validateQrInput } from './qr';

describe('formatBytes', () => {
  it('B/KB/MB 단위로 표시한다', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(15360)).toBe('15 KB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.50 MB');
    expect(formatBytes(1024 * 1024 * 12)).toBe('12.0 MB');
    expect(formatBytes(-1)).toBe('-');
  });
});

describe('savingsPercent / formatPercent', () => {
  it('절감률을 소수 1자리로 계산한다', () => {
    expect(savingsPercent(1000, 400)).toBe(60);
    expect(savingsPercent(1000, 1000)).toBe(0);
    expect(savingsPercent(1000, 1200)).toBe(-20);
    expect(savingsPercent(0, 10)).toBeNull();
  });

  it('표시는 절감이 + 부호(-)로, 증가는 +로 나타낸다', () => {
    expect(formatPercent(60)).toBe('-60.0%');
    expect(formatPercent(-12.3)).toBe('+12.3%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(null)).toBe('-');
  });
});

describe('checkImageFile', () => {
  it('JPG/PNG/WebP는 통과', () => {
    expect(checkImageFile({ name: 'a.jpg', type: 'image/jpeg', size: 1024 }).ok).toBe(true);
    expect(checkImageFile({ name: 'a.PNG', type: 'image/png', size: 1024 }).ok).toBe(true);
    expect(checkImageFile({ name: 'a.webp', type: 'image/webp', size: 1024 }).ok).toBe(true);
    expect(checkImageFile({ name: 'a.jpeg', type: '', size: 1024 }).mime).toBe('image/jpeg');
  });

  it('텍스트/PDF는 한글 오류와 함께 거부', () => {
    const txt = checkImageFile({ name: 'memo.txt', type: 'text/plain', size: 10 });
    expect(txt.ok).toBe(false);
    expect(txt.reason).toContain('지원하지 않는 파일');
    expect(txt.reason).toContain('.txt');
    const pdf = checkImageFile({ name: 'doc.pdf', type: 'application/pdf', size: 10 });
    expect(pdf.ok).toBe(false);
    expect(pdf.reason).toContain('.pdf');
  });

  it('빈 파일·과대 파일을 거부', () => {
    if (checkImageFile({ name: 'a.png', type: 'image/png', size: 0 }).ok) throw new Error('빈 파일이 통과됨');
    if (checkImageFile({ name: 'a.png', type: 'image/png', size: 41 * 1024 * 1024 }).ok) throw new Error('과대 파일이 통과됨');
  });
});

describe('outputFileName', () => {
  it('확장자를 출력 형식에 맞춘다', () => {
    expect(outputFileName('photo.png', 'image/webp')).toBe('photo-압축.webp');
    expect(outputFileName('photo.gif', 'image/jpeg')).toBe('photo-압축.jpg');
    expect(outputFileName('noext', 'image/png')).toBe('noext-압축.png');
  });
});

describe('QR 입력 검증·파일명', () => {
  it('빈 입력은 한글 오류', () => {
    expect(validateQrInput('   ')).toBe('QR 코드로 만들 내용을 입력해 주세요.');
    expect(validateQrInput('hi')).toBeNull();
  });

  it('1200자 초과를 막는다', () => {
    expect(validateQrInput('a'.repeat(1201))).toContain('너무 깁니다');
  });

  it('파일명은 한글/영문 슬러그와 시각을 담는다', () => {
    expect(qrFileName('https://example.com/pocket-tools', new Date(2026, 10, 21, 13, 5, 9))).toBe(
      'qr-example-com-pocket-tools-20261121-130509.png',
    );
    expect(qrFileName('', new Date(2026, 10, 21, 13, 5, 9))).toBe('qr-code-20261121-130509.png');
  });
});

describe('formatExtension', () => {
  it('MIME을 짧은 이름으로', () => {
    expect(formatExtension('image/jpeg')).toBe('JPG');
    expect(formatExtension('image/png')).toBe('PNG');
    expect(formatExtension('image/webp')).toBe('WebP');
  });
});
