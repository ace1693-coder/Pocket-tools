import { describe, expect, it } from 'vitest';
import { cleanUrl, isEssentialParam, isTrackingParam } from './urlCleaner';

function cleanedOf(input: string): string {
  const result = cleanUrl(input);
  if (!result.ok) throw new Error(`예상치 못한 오류: ${result.error}`);
  return result.cleaned;
}

describe('cleanUrl — 추적 파라미터 제거', () => {
  it('utm_*·fbclid·gclid를 지우고 id·page는 남긴다', () => {
    const out = cleanedOf(
      'https://shop.example.com/item?utm_source=ig&utm_medium=social&utm_campaign=fall&fbclid=abc&gclid=xyz&id=4821&page=2',
    );
    expect(out).toBe('https://shop.example.com/item?id=4821&page=2');
  });

  it('제거 개수를 정확히 센다', () => {
    const result = cleanUrl('https://a.com/?utm_source=a&utm_source=b&fbclid=c&q=hi');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedCount).toBe(3);
    expect(result.kept.map((param) => param.key)).toEqual(['q']);
    expect(result.changed).toBe(true);
  });

  it('제거할 것이 없으면 changed=false', () => {
    const result = cleanUrl('https://a.com/path?id=1&v=abc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
    expect(result.removedCount).toBe(0);
  });

  it('유튜브 si, 인스타 igshid, X ref_src를 지운다', () => {
    expect(cleanedOf('https://youtu.be/abc123?si=Q1w2E3&t=42&v=abc123')).toBe('https://youtu.be/abc123?t=42&v=abc123');
    expect(cleanedOf('https://www.instagram.com/p/XYZ/?igshid=Zjc2ZTc4Nzk%3D')).toBe('https://www.instagram.com/p/XYZ/');
    expect(cleanedOf('https://x.com/u/status/1?ref_src=twsrc%5Etfw')).toBe('https://x.com/u/status/1');
  });

  it('알리/중국 커머스 추적값 spm을 지운다', () => {
    expect(cleanedOf('https://item.example.com/1?spm=a2g0o.detail.1000023&id=99')).toBe('https://item.example.com/1?id=99');
  });
});

describe('cleanUrl — 필수/서명 파라미터 보존', () => {
  it('AWS 서명 파라미터를 모두 보존한다', () => {
    const input =
      'https://cdn.example.com/f.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F2026&X-Amz-Date=20261121T040000Z&X-Amz-Expires=600&X-Amz-Signature=9f8a7b&X-Amz-SignedHeaders=host&utm_source=news';
    expect(cleanedOf(input)).toBe(
      'https://cdn.example.com/f.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F2026&X-Amz-Date=20261121T040000Z&X-Amz-Expires=600&X-Amz-Signature=9f8a7b&X-Amz-SignedHeaders=host',
    );
  });

  it('OAuth code·state·token과 콘텐츠 식별자를 보존한다', () => {
    const out = cleanedOf(
      'https://auth.example.com/cb?code=4%2F0Ab&state=xyz123&token=abc.def&page=3&tab=review&sort=new&q=%EA%B2%80%EC%83%89&utm_source=mail',
    );
    expect(out).toBe(
      'https://auth.example.com/cb?code=4%2F0Ab&state=xyz123&token=abc.def&page=3&tab=review&sort=new&q=%EA%B2%80%EC%83%89',
    );
  });

  it('보존 우선: 이름에 signature/token이 들어가면 추적 목록과 겹쳐도 남긴다', () => {
    expect(isEssentialParam('Signature')).toBe(true);
    expect(isEssentialParam('X-Amz-Signature')).toBe(true);
    expect(isEssentialParam('session_token')).toBe(true);
    expect(isEssentialParam('Key-Pair-Id')).toBe(true);
    expect(cleanedOf('https://a.com/?Signature=abc&token=def&utm_campaign=x')).toBe('https://a.com/?Signature=abc&token=def');
  });

  it('CloudFront/구글 서명 파라미터를 보존한다', () => {
    const out = cleanedOf('https://d.example.com/v.mp4?Policy=eyJ&Key-Pair-Id=K1&Signature=abc&Expires=1790000000');
    expect(out).toBe('https://d.example.com/v.mp4?Policy=eyJ&Key-Pair-Id=K1&Signature=abc&Expires=1790000000');
  });

  it('추적/보존 판정 함수', () => {
    expect(isTrackingParam('utm_source')).toBe(true);
    expect(isTrackingParam('UTM_Source')).toBe(true);
    expect(isTrackingParam('id')).toBe(false);
    expect(isTrackingParam('name')).toBe(false);
    expect(isEssentialParam('id')).toBe(true);
    expect(isEssentialParam('utm_source')).toBe(false);
  });
});

describe('cleanUrl — 입력 검증과 표시', () => {
  it('빈 입력은 한글 오류', () => {
    const result = cleanUrl('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('URL을 입력해 주세요.');
  });

  it('http/https가 아닌 스킴은 거부한다', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://a.com/x', 'data:text/html,hi', 'file:///etc/passwd']) {
      const result = cleanUrl(bad);
      expect(result.ok).toBe(false);
    }
  });

  it('프로토콜이 없으면 https를 붙이고 표시한다', () => {
    const result = cleanUrl('example.com/a?utm_source=x&id=1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.protocolAdded).toBe(true);
    expect(result.cleaned).toBe('https://example.com/a?id=1');
  });

  it('도메인이 없으면 명확한 한글 오류', () => {
    const result = cleanUrl('https://not-a-domain');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('도메인');
  });

  it('해시(fragment)는 그대로 유지한다', () => {
    expect(cleanedOf('https://a.com/doc?utm_medium=x#section-3')).toBe('https://a.com/doc#section-3');
  });

  it('남기는 파라미터의 원본 인코딩을 재작성하지 않는다', () => {
    expect(cleanedOf('https://a.com/s?q=%ED%95%9C%EA%B8%80+%EA%B2%80%EC%83%89&utm_source=x')).toBe(
      'https://a.com/s?q=%ED%95%9C%EA%B8%80+%EA%B2%80%EC%83%89',
    );
  });

  it('쿼리가 없으면 그대로 둔다', () => {
    expect(cleanedOf('https://a.com/path')).toBe('https://a.com/path');
  });
});
