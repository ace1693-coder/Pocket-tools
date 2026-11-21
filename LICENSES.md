# 사용 오픈소스 및 라이선스

Pocket Tools는 **모든 처리를 브라우저 안에서** 수행합니다. 아래 라이브러리는 npm으로 설치해 앱 번들(`dist/assets/*.js`)이나
로컬 정적 자산(`dist/pdfjs/`)으로 포함되며, 실행 시 외부 CDN·API를 호출하지 않습니다.

## 앱 번들에 포함되는 런타임 의존성 (배포물에 들어감)

| 패키지 | 버전 | 라이선스 | 용도 | 로드 시점 |
| --- | --- | --- | --- | --- |
| react | 18.3.1 | MIT | UI 렌더링 | 첫 화면 |
| react-dom | 18.3.1 | MIT | DOM 렌더링 | 첫 화면 |
| qrcode | 1.5.4 | MIT | QR 코드 매트릭스 생성·Canvas 렌더링 | 첫 화면 |
| dijkstrajs | 1.0.3 | MIT | (qrcode 내부 의존성) 최적 분할 경로 계산 | 첫 화면 |
| pdfjs-dist | 5.4.624 | **Apache-2.0** | ⑤ PDF → 이미지 실제 렌더링(페이지 → PNG/JPEG) | PDF 도구 최초 사용 시(지연 로딩) |
| pdf-lib | 1.17.1 | MIT | ⑤ 이미지 → PDF 실제 생성(페이지·이미지 임베드) | 이미지→PDF 최초 사용 시(지연 로딩) |
| exifr | 7.1.3 | MIT | ⑥ EXIF(GPS·카메라·촬영일시) 파싱 및 결과 바이트 재검사 | EXIF 도구 사용 시(지연 로딩) |
| jszip | 3.10.2 | **MIT 또는 GPL-3.0-or-later** (MIT 선택) | 페이지·워터마크 이미지 ZIP 묶음 | ZIP 다운로드 시(지연 로딩) |

### pdf-lib / jszip 내부 의존성

| 패키지 | 버전 | 라이선스 | 비고 |
| --- | --- | --- | --- |
| @pdf-lib/standard-fonts | 1.0.0 | MIT | pdf-lib 내부 |
| @pdf-lib/upng | 1.0.1 | MIT | pdf-lib 내부(PNG 임베드) |
| pako | 1.0.11 (jszip은 1.0.2) | MIT | Deflate 압축 |
| tslib | 1.14.1 | 0BSD | pdf-lib 내부 |
| lie | 3.3.0 | MIT | jszip 내부 Promise 구현 |
| setimmediate | 1.0.5 | MIT | jszip 내부 |
| readable-stream | 2.3.8 | MIT | jszip 내부(Node 경로, 브라우저 번들에서는 미사용) |

> `qrcode`의 `dependencies`에는 `pngjs`(MIT), `yargs`(MIT)와 그 하위 패키지도 있지만 브라우저 빌드는
> `lib/browser.js`(코어 + Canvas 렌더러)만 사용하므로 실제 번들에 포함되지 않습니다.

## pdf.js 로컬 정적 자산 (`public/pdfjs/` → `dist/pdfjs/`)

| 자산 | 크기 | 라이선스 | 용도 |
| --- | --- | --- | --- |
| `pdf.worker.min.mjs` (pdfjs-dist 5.4.624) | 1.08MB | Apache-2.0 | PDF 파싱·렌더 전용 웹 워커 |
| `standard_fonts/` | 804KB | Apache-2.0 | 표준 14 폰트가 임베드되지 않은 PDF 렌더 |
| `cmaps/` | 1.7MB | Apache-2.0 | CJK(한국어 등) CMap — 폰트 미임베드 문서 렌더 |
| `wasm/` | 932KB | Apache-2.0 | JPEG2000/색 변환 등 pdf.js WASM 모듈 |
| `iccs/` | 24KB | Apache-2.0 | ICC 색 프로파일 |

`scripts/copy-pdfjs-assets.mjs`가 빌드 전에 `node_modules/pdfjs-dist`에서 복사합니다. 워커 파일 앞에는
Chromium 130 등에서 빠진 `Uint8Array.toHex/fromHex/toBase64/fromBase64`·`Promise.withResolvers` 폴리필
(`scripts/worker-polyfill.js`, 자체 작성)을 붙입니다. 워커·폰트·CMap은 외부 URL이 아니라 앱과 같은 오리진에서만
읽으므로 **외부 네트워크 요청 0건** 조건을 지킵니다.

## 라이선스 원문 포함 위치 (배포물)

`public/licenses/`에 원문을 함께 배포합니다(빌드 시 `dist/licenses/`).

- `pdfjs-dist-LICENSE.txt` (Apache-2.0)
- `pdf-lib-LICENSE.md` (MIT)
- `exifr-LICENSE.txt` (MIT)
- `jszip-LICENSE.markdown` (MIT or GPL-3.0-or-later)
- `react-LICENSE.txt`, `react-dom-LICENSE.txt` (MIT)

`qrcode`는 저장소에 LICENSE 파일이 없지만 package.json에 MIT로 명시되어 있습니다. MIT 고지 의무에 따라
`LICENSES.md`(이 문서)에 저작권·라이선스를 기록합니다.

## 개발·검증 전용 (배포물에 포함되지 않음)

| 패키지 | 버전 | 라이선스 | 용도 |
| --- | --- | --- | --- |
| vite | 5.4.21 | MIT | 번들러/개발 서버 |
| @vitejs/plugin-react | 4.7.0 | MIT | React 플러그인 |
| typescript | 5.9.3 | Apache-2.0 | 타입 검사·빌드 |
| vitest | 2.1.9 | MIT | 단위 테스트 러너 |
| jsqr | 1.4.0 | Apache-2.0 | **E2E 검증용** QR 디코더 (생성된 PNG/Canvas를 실제로 스캔해 원문 일치 확인) |
| piexifjs | 1.0.6 | MIT | **E2E 검증용** 테스트 JPEG에 실제 GPS·카메라 EXIF를 심는 도구 |
| playwright | 1.48.2 | Apache-2.0 | headless Chromium E2E |
| @types/* | - | MIT | 타입 정의 |

## 라이선스 원문 확인 방법

```bash
node -e "for (const p of ['react','react-dom','qrcode','dijkstrajs','pdfjs-dist','pdf-lib','exifr','jszip','jsqr','piexifjs']) console.log(p, require('./node_modules/'+p+'/package.json').version, require('./node_modules/'+p+'/package.json').license)"
```

- MIT: 저작권 고지와 허가 문구를 유지하면 상업적 사용·수정·재배포 가능.
- Apache-2.0(pdfjs-dist·jsqr·typescript·playwright): NOTICE 유지 및 변경 사항 고지 의무. `pdfjs-dist`는 배포물에
  포함되므로 라이선스 원문을 `dist/licenses/`에 함께 배포합니다(워커 파일 앞 폴리필 주입은 변경 사항이며
  `scripts/worker-polyfill.js`에 원문이 있습니다). 나머지는 **개발/검증 도구**로만 쓰여 배포 번들에는 포함되지 않습니다.
- jszip: MIT 또는 GPL-3.0-or-later 중 **MIT**를 선택해 사용합니다.

## 이 앱 자체

개인 프로젝트로 만든 웹앱이며, 소스는 GitHub Pages 배포를 위해 공개되어 있습니다.
앱 코드에는 별도 라이선스를 붙이지 않았습니다(무단 재배포·상업적 사용 전 문의).
