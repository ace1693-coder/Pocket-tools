/**
 * 최신 스펙 내장 메서드 폴리필 (메인 스레드용).
 *
 * pdf.js 5.4는 Uint8Array의 ES2025 헬퍼(toHex / fromHex / toBase64 / fromBase64)와
 * Promise.withResolvers를 사용한다. Chromium 130 등 아직 지원하지 않는 브라우저에서도
 * PDF 도구가 동작하도록 최소 구현을 채운다. (워커 쪽은 scripts/worker-polyfill.js가 같은 역할)
 */
export function installModernBuiltins(): void {
  const proto = Uint8Array.prototype as unknown as Record<string, unknown>;

  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toHex', {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let out = '';
        for (let i = 0; i < this.length; i += 1) out += this[i].toString(16).padStart(2, '0');
        return out;
      },
    });
  }

  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toBase64', {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < this.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(this.subarray(i, i + chunk)));
        }
        return btoa(binary);
      },
    });
  }

  const ctor = Uint8Array as unknown as Record<string, unknown>;
  if (typeof ctor.fromHex !== 'function') {
    Object.defineProperty(Uint8Array, 'fromHex', {
      configurable: true,
      writable: true,
      value(hex: string) {
        const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
        const out = new Uint8Array(Math.floor(clean.length / 2));
        for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        return out;
      },
    });
  }

  if (typeof ctor.fromBase64 !== 'function') {
    Object.defineProperty(Uint8Array, 'fromBase64', {
      configurable: true,
      writable: true,
      value(input: string) {
        const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(normalized);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
        return out;
      },
    });
  }

  const promiseCtor = Promise as unknown as { withResolvers?: unknown };
  if (typeof promiseCtor.withResolvers !== 'function') {
    Object.defineProperty(Promise, 'withResolvers', {
      configurable: true,
      writable: true,
      value<T>() {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      },
    });
  }
}
