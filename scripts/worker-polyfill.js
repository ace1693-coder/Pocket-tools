/* eslint-disable */
/**
 * pdf.js 워커에 주입하는 폴리필 (워커는 별도 전역이라 메인 스레드 폴리필이 적용되지 않는다).
 * scripts/copy-pdfjs-assets.mjs 가 pdf.worker.min.mjs 앞에 이 코드를 붙여 public/pdfjs/ 에 저장한다.
 * src/lib/compat.ts 와 같은 내용을 유지한다.
 */
(function () {
  var proto = Uint8Array.prototype;
  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toHex', {
      configurable: true,
      writable: true,
      value: function () {
        var out = '';
        for (var i = 0; i < this.length; i += 1) out += this[i].toString(16).padStart(2, '0');
        return out;
      },
    });
  }
  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toBase64', {
      configurable: true,
      writable: true,
      value: function () {
        var binary = '';
        var chunk = 0x8000;
        for (var i = 0; i < this.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.prototype.slice.call(this.subarray(i, i + chunk)));
        }
        return btoa(binary);
      },
    });
  }
  if (typeof Uint8Array.fromHex !== 'function') {
    Object.defineProperty(Uint8Array, 'fromHex', {
      configurable: true,
      writable: true,
      value: function (hex) {
        var clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
        var out = new Uint8Array(Math.floor(clean.length / 2));
        for (var i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        return out;
      },
    });
  }
  if (typeof Uint8Array.fromBase64 !== 'function') {
    Object.defineProperty(Uint8Array, 'fromBase64', {
      configurable: true,
      writable: true,
      value: function (input) {
        var normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
        var binary = atob(normalized);
        var out = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
        return out;
      },
    });
  }
  if (typeof Promise.withResolvers !== 'function') {
    Object.defineProperty(Promise, 'withResolvers', {
      configurable: true,
      writable: true,
      value: function () {
        var resolve;
        var reject;
        var promise = new Promise(function (res, rej) {
          resolve = res;
          reject = rej;
        });
        return { promise: promise, resolve: resolve, reject: reject };
      },
    });
  }
})();
