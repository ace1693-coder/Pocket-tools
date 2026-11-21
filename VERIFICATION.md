# Pocket Tools — 실제 검증 결과 (2026-11-21 · 2차 기능 4종 추가)

검증 환경: Node v20.18.0 / Chromium(Playwright 1.48.2, headless) / 모바일 뷰포트 **390×844**, DPR 3, `isMobile·hasTouch`,
로케일 ko-KR, 시간대 Asia/Seoul. `dist/` 프로덕션 빌드를 자체 정적 서버로 서빙해 실측했습니다.
(**외부 CDN 요청 0건** — pdf.js 워커·표준 폰트·CMap·WASM·ICC까지 모두 `./pdfjs/` 로컬 자산에서만 읽습니다.)

## 실행한 명령

| 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | 통과 — 에러 0 |
| `npm run build` | 통과 — 초기 번들 `index-*.js` **249.26KB(gzip 82.95KB)**, CSS 16.78KB(gzip 4.21KB) |
| `npx vitest run` | 통과 — **8개 파일 / 84개 테스트**(1차 28개 + 2차 신규 56개) |
| `node e2e/e2e.mjs` | 통과 — **61개 항목 전부 통과**, 콘솔 에러 0 · 페이지 에러 0 · 외부 전송 0건 |

### 지연 로딩 번들 (2차 기능)

| 청크 | 크기(gzip) | 로드 시점 |
| --- | --- | --- |
| `index-*.js` (React + 7개 도구 UI) | 249.26KB (82.95KB) | 첫 화면 |
| `pdf-*.js` (pdf.js 5.4.624) | 446.22KB (132.02KB) | PDF → 이미지 최초 사용 |
| `es-*.js` (pdf-lib 1.17.1) | 438.41KB (181.26KB) | 이미지 → PDF 최초 사용 |
| `jszip.min-*.js` (JSZip 3.10.2) | 97.77KB (30.36KB) | ZIP 다운로드 |
| `full.esm-*.js` (exifr 7.1.3) | 75.24KB (26.47KB) | EXIF 검사 |
| `pdfjs/` 정적 자산(워커 1.08MB·표준폰트·CMap·WASM·ICC) | 4.4MB | 필요한 시점에 자체 오리진에서만 요청 |

## 2차 기능 핵심 수치

| 기능 | 실제로 확인한 것 | 결과 |
| --- | --- | --- |
| ④ 사진 비율 조정 | 1600×1200 → 1:1 여백 **1600×1600**(다운로드 PNG IHDR 실측), 9:16 **900×1600**(비율 0.5625), 16:9 크롭 **1600×900**(모서리 rgb(41,137,91) = 여백 없음), 여백 배경 검정 rgb(0,0,0) vs 흐린 원본 rgb(68,58,82), WebP 출력(RIFF/WEBP 915,218B) | 통과 |
| ⑤ PDF ↔ 이미지 | 이미지 3장 → 순서 변경·1장 삭제 → **2페이지 PDF 생성** → 다운로드 파일을 pdf-lib으로 재파싱(1쪽 1600×1200, 2쪽 600×400) → 그 PDF 재업로드 → **2페이지 실제 렌더**(PNG 1쪽 1240×930, JPEG도 1240×930) · 페이지별 저장 · ZIP 2항목 · .txt/암호 PDF 오류 안내 | 통과 |
| ⑥ EXIF 제거·모자이크 | GPS 37.570000°N 126.978056°E · PocketCam PC-2026 · 2026-11-20 15:04:05 검출 → 마우스·터치 드래그로 영역 2개 → 되돌리기/초기화 → 저장 직전 재검사 **EXIF 0건·GPS 0건·카메라 0건** → 다운로드 파일 exifr 재파싱 태그 0개, `Exif\0\0` 마커 없음, 모자이크 영역 안 69,380px 변화·영역 밖 0px 변화(PNG 무손실) | 통과 |
| ⑦ 워터마크 | 2장 동시 업로드 → 텍스트·투명도 60%·좌상단 → **2장 일괄 적용** → ZIP 2항목(원본과 다른 바이트) + 개별 다운로드(좌상단 20,943px 변화), 로고 PNG·우하단 100% → 해당 영역 41,819px 변화 | 통과 |

## 전체 E2E 체크 (61건)

### 기본 — 4/4 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | 첫 로드(App Shell) · 도구 7개 | title="Pocket Tools — 링크 · 사진 · PDF · QR 7가지 도구", h1="Pocket Tools", 탭 7개: URL 정리 / 이미지 압축 / 비율 조정 / PDF ↔ 이미지 / EXIF·모자이크 / 워터마크 / QR 생성 |
| 통과 | 390×844 가로 스크롤 0 | 초기 화면: scrollWidth 390 ≤ clientWidth 390 (body 390) |
| 통과 | 탭 7개가 잘리지 않고 배치된다 | URL 정리:86px 이미지 압축:86px 비율 조정:86px PDF ↔ 이미지:86px EXIF·모자이크:86px 워터마크:86px QR 생성:86px |
| 통과 | manifest·아이콘·Service Worker 연결 | manifest "Pocket Tools — 링크·사진·PDF·QR 7가지 도구" · 아이콘/워커 ./icons/icon-192.png:200/3608B ./icons/icon-512.png:200/11396B ./pdfjs/pdf.worker.min.mjs:200/1081152B · SW http://127.0.0.1:4319/ · 캐시 pocket-tools-v2 |

### URL — 5/5 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | 예시 URL 추적 파라미터 제거 | 요약="추적 파라미터 5개를 제거했습니다. 필수 파라미터 2개는 그대로 보존했습니다.", 제거 칩 5개, 결과="https://shop.example.com/item/4821?id=4821&page=2#review" |
| 통과 | 서명 URL: X-Amz-* 보존 · utm 제거 | 서명 보존=true, 추적 제거=true, 요약="추적 파라미터 2개를 제거했습니다. 필수 파라미터 6개는 그대로 보존했습니다." |
| 통과 | 잘못된 URL 한글 오류 안내 | 파싱 오류="올바른 URL이 아닙니다. 주소 전체를 붙여넣어 주세요. (예: https://example.com/?utm_source=news)" / 도메인 오류="도메인 형식이 올바르지 않습니다. 주소를 다시 확인해 주세요. (예: https://example.com)" |
| 통과 | 원클릭 복사 → 클립보드 일치 | 클립보드="https://shop.example.com/item/4821?id=4821&page=2#review" |
| 통과 | 결과 화면 가로 스크롤 0 | URL 결과: scrollWidth 390 ≤ clientWidth 390 (body 390) |

### 이미지 — 8/8 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | JPG 업로드 → 실제 압축·용량 감소 | 원본 1.09 MB(1143455B) → 결과 447 KB, 절감 -60.0%, 미리보기 1600×1200, JPG · 71ms 처리 |
| 통과 | 결과 파일 실제 다운로드 | 파일 test-photo-압축.jpg, 457274B 저장 |
| 통과 | WebP 변환 → 형식 전환 확인 | WebP · 290ms 처리 (결과 501 KB) |
| 통과 | 품질 10% → 용량 추가 감소 | 절감 -88.8%, 결과 125 KB |
| 통과 | 텍스트 파일 업로드 → 한글 오류 | 지원하지 않는 파일입니다(.txt). JPG · PNG · WebP 이미지만 압축할 수 있습니다. |
| 통과 | 손상 파일 업로드 → 읽기 실패 안내 | 이미지를 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식입니다. |
| 통과 | PNG 업로드 후 압축 결과 표시(원본 형식 유지) | 결과 182 KB, PNG · 34ms 처리 |
| 통과 | 결과 화면 가로 스크롤 0 | 이미지 결과: scrollWidth 390 ≤ clientWidth 390 (body 390) |

### QR — 5/5 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | 빈 입력 오류 안내 | QR 코드로 만들 내용을 입력해 주세요. |
| 통과 | QR 생성 → jsQR 실디코딩 100% 일치 | 캔버스 1024×1024, 디코드 원문 일치 |
| 통과 | QR PNG 다운로드 → 파일 디코딩 일치 | qr-example-com-pocket-tools-20261121-141712.png · PNG 서명=true · 1024×1024 · 58303B · 디코드 일치 |
| 통과 | 이미지 복사 (또는 fallback 안내) | 상태="QR 이미지를 클립보드에 복사했습니다. 붙여넣기로 사용하세요." |
| 통과 | 내용 수정 시 자동 갱신 + 디코딩 일치 | 갱신된 QR 디코딩 일치 |

### ④ 비율 — 6/6 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | JPG 1:1 여백 추가 → 1600×1600 실제 생성·다운로드 | 1600×1200 → 1600×1600 (표시), 파일 test-photo-1x1-여백.png 1600×1600 3760037B, 비율 확인: 1:1 일치 · 181ms 처리 |
| 통과 | 9:16 여백 추가 → 900×1600 (비율 0.5625) | 900×1600, 파일 900×1600 비율 0.5625 |
| 통과 | 16:9 꽉 채우기(중앙 크롭) → 1600×900 | 1600×900, 파일 1600×900, 모서리 rgb(42,53,117) |
| 통과 | 여백 배경: 검정 vs 흐린 원본 구분 | 검정 여백 rgb(0,0,0) / 흐린 여백 rgb(73,58,85) |
| 통과 | WebP 출력·전후 해상도·용량 표시 | test-photo-1x1-여백.webp 920520B 1600×1600, 용량 1.09 MB → 899 KB |
| 통과 | 잘못된 파일(.txt) 업로드 오류 안내 | 지원하지 않는 파일입니다(.txt). JPG · PNG · WebP 이미지를 선택해 주세요. |

### ⑤ PDF — 10/10 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | 이미지 3장 추가 → 순서 목록 표시 | 3장, 1번째=photo-2.png600×400 · 98 KB |
| 통과 | 위로 이동 → 페이지 순서 변경 | 1번째=test-photo.jpg1600×1200 · 1.09 MB, 2번째=photo-2.png600×400 · 98 KB |
| 통과 | 3번째 페이지 삭제 → 2장 | 2장, 목록 2개 |
| 통과 | PDF 생성·다운로드 → 페이지 수/페이지 크기 검증 | pocket-tools-2장-20261121-1417.pdf 1217965B, %PDF-, 2페이지, 1쪽 1600×1200, 2쪽 600×400 |
| 통과 | PDF → 이미지: 2페이지 실제 렌더링 | 2페이지를 PNG로 변환 · “Pocket Tools 이미지 PDF” · 미리보기 2개 · blob:http:// |
| 통과 | 페이지 1 이미지 다운로드 → 실제 PNG 1240×930 | built-images-001.png 2251023B, PNG 서명=true, 1240×930 |
| 통과 | 전체 ZIP 다운로드 → 2개 항목 | built-images-이미지-2장-20261121-1417.zip 2486789B, 항목 page-001.png, page-002.png |
| 통과 | JPEG 형식으로 다시 변환·다운로드 | built-images-001.jpg 498022B 1240×930 · JPEG 매직=true · 2페이지를 JPEG로 변환 · “Pocket Tools 이미지 PDF” |
| 통과 | 잘못된 파일(.txt) 업로드 오류 안내 | PDF 파일만 선택할 수 있습니다(.pdf). 이미지를 PDF로 만들려면 위의 "이미지 → PDF" 모드를 사용하세요. |
| 통과 | 암호화 PDF 오류 안내 | 암호(비밀번호)가 설정된 PDF입니다. 암호를 해제한 파일을 다시 선택해 주세요. |

### ⑥ EXIF — 10/10 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | 실제 EXIF(GPS·카메라·촬영일시) 검출 | 메타데이터 11개 항목 발견 · JPEG · GPS=37.570000° N, 126.978056° E · 카메라=PocketCam PC-2026 · 촬영=2026-11-20 15:04:05 · 태그 7개 |
| 통과 | 마우스 드래그로 모자이크 영역 1개 지정 | 영역 1개 |
| 통과 | 터치(포인터) 드래그로 영역 추가 → 2개 | 영역 2개 |
| 통과 | 되돌리기·전체 초기화 동작 | 되돌리기 후 1개, 초기화 후 0개 |
| 통과 | PNG 저장 → 결과 바이트 EXIF 0건 검증 표시 | ✓ 메타데이터 완전 제거 확인 · EXIF 0건 · GPS 0건 · 카메라 0건 / 결과 바이트 재검사: EXIF 세그먼트 0건 · 파서 태그 0건 |
| 통과 | 다운로드 파일에서 EXIF·GPS 태그 0건 실측 | exif-photo-모자이크-EXIF제거.png 1478066B · 'Exif' 마커=false · 개인정보 태그=0 · GPS=false · 카메라=false (구조 태그 제외) |
| 통과 | 모자이크 실제 픽셀 적용(영역 안 변화·밖 동일) | 영역 안 변화 69862/70000px · 영역 밖 변화 0/730000px · 최대 변화 84.7 |
| 통과 | JPEG 저장도 EXIF 0건 (다운로드 실측) | exif-photo-모자이크-EXIF제거.jpg 334057B · JPEG 매직=true · Exif 마커=false · 개인정보 태그 0 |
| 통과 | EXIF 없는 PNG 안내 | 이 사진에는 EXIF(위치·카메라·촬영일시) 정보가 없습니다. PNG처럼 원래 메타데이터가 없는 이미지이며, 저장해도 메타데이터는 생기지 않습니다. |
| 통과 | 잘못된 파일(.txt) 오류 안내 | 지원하지 않는 파일입니다(.txt). JPG · PNG · WebP 이미지를 선택해 주세요. |

### ⑦ 워터마크 — 6/6 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | 다중 이미지 2장 업로드 → 썸네일 표시 | 2장, 썸네일 2개, 미리보기 캔버스 1 |
| 통과 | 텍스트·투명도·위치 설정 후 일괄 적용 | 상태="2장에 워터마크를 적용했습니다. ZIP 또는 개별 다운로드로 저장하세요." · 2장 완료 · 총 1.02 MB |
| 통과 | ZIP 다운로드 → 2개 항목, 원본과 다른 바이트 | 워터마크-2장-20261121-1417.zip 1068785B · test-photo-워터마크.jpg(962735B,원본과다름=true), photo-2-워터마크.png(109159B,원본과다름=true) |
| 통과 | 개별 다운로드 + 좌상단 워터마크 픽셀 확인 | test-photo-워터마크.jpg 962735B · 좌상단 변화 20615px(최대 132) · 하단 변화 23243px |
| 통과 | 로고 이미지 + 우하단 위치 일괄 적용 | logo.png · 240×80 (투명 PNG 권장) · 우하단 변화 42162px(최대 203.7) · test-photo-워터마크.jpg 953746B |
| 통과 | 잘못된 파일(.txt) 오류 안내 | 지원하지 않는 파일입니다(.txt). JPG · PNG · WebP 이미지를 선택해 주세요. |

### 안정성 — 7/7 통과

| 결과 | 항목 | 실측 증빙 |
| --- | --- | --- |
| 통과 | 새로고침 후 정상 동작(탭 복원 포함) | 복원 탭=tab-wm, URL 결과 정상, 비율 변환 600×600 |
| 통과 | 하위 경로 배포(/pocket-tools/) 호환 | manifest href="./manifest.webmanifest", pdf 워커 도달=true, 콘솔 에러 0, 요청 실패 0 |
| 통과 | 360·390·430px × 7개 탭 가로 스크롤 0 | 360/label-clipped:0 360/url:360≤360 360/image:360≤360 360/ratio:360≤360 360/pdf:360≤360 360/exif:360≤360 360/wm:360≤360 360/qr:360≤360 390/label-clipped:0 390/url:390≤390 390/image:390≤390 390/ratio:390≤390 390/pdf:390≤390 390/exif:390≤390 390/wm:390≤390 390/qr:390≤390 430/label-clipped:0 430/url:430≤430 430/image:430≤430 430/ratio:430≤430 430/pdf:430≤430 430/exif:430≤430 430/wm:430≤430 430/qr:430≤430 |
| 통과 | 콘솔 에러 0 | 콘솔 에러 없음 |
| 통과 | 페이지 에러 0 | 페이지 에러 없음 |
| 통과 | 외부 네트워크 전송 0건 | 네트워크 요청 27건 전부 자체 오리진(27건), 외부 0건, 메모리(blob/data) 28건 |
| 통과 | 오프라인 재접속 (오프라인 캐시) | SW 제어=true, 오프라인 로드 h1="Pocket Tools", 탭 7개 |

## 스크린샷 (390×844 뷰포트, DPR 3)

| 파일 | 내용 |
| --- | --- |
| `screenshots/01-url-result.png` · `01-url-full.png` | 1차: URL 정리 결과 |
| `screenshots/02-image-compressed.png` · `02-image-full.png` | 1차: 이미지 압축 결과 |
| `screenshots/03-qr.png` · `03-qr-full.png` | 1차: QR 생성 결과 |
| `screenshots/04-ratio.png` | ④ 1:1 여백 + 흐린 원본 배경 결과(1600×1600, 전후 해상도·용량) |
| `screenshots/05-pdf.png` | ⑤ 만든 PDF를 다시 변환한 2페이지(1쪽 1240×930 · 2쪽 1240×827) |
| `screenshots/06-exif-mosaic.png` | ⑥ EXIF 카드(GPS·카메라·촬영일시) + 캔버스 모자이크 영역 |
| `screenshots/06-exif-verify.png` | ⑥ 저장 직전 결과 바이트 재검사 증빙(EXIF 0건 · GPS 0건 · 카메라 0건) |
| `screenshots/07-watermark.png` | ⑦ 로고 워터마크 우하단 + 2장 완료·ZIP/개별 다운로드 |

## 다운로드 산출물 (실제 저장된 파일)

- `e2e/downloads/built-images.pdf` — 1,217,965B
- `e2e/downloads/downloaded-image.jpg` — 457,274B
- `e2e/downloads/downloaded-qr.png` — 58,303B
- `e2e/downloads/exif-mosaic.jpg` — 334,057B
- `e2e/downloads/exif-mosaic.png` — 1,478,066B
- `e2e/downloads/pdf-page-1.jpg` — 498,022B
- `e2e/downloads/pdf-page-1.png` — 2,251,023B
- `e2e/downloads/pdf-pages.zip` — 2,486,789B
- `e2e/downloads/ratio-16x9-crop.png` — 2,816,838B
- `e2e/downloads/ratio-1x1.png` — 3,760,037B
- `e2e/downloads/ratio-9x16.png` — 1,330,943B
- `e2e/downloads/ratio-bg-black.png` — 3,760,037B
- `e2e/downloads/ratio-bg-blur.png` — 3,970,250B
- `e2e/downloads/ratio.webp` — 920,520B
- `e2e/downloads/watermark-1.jpg` — 962,735B
- `e2e/downloads/watermark-logo.jpg` — 953,746B
- `e2e/downloads/watermarks.zip` — 1,068,785B

## 남은 오류·제한

- 실패 항목 없음(61/61). 콘솔 에러 0, 페이지 에러 0, 외부 네트워크 전송 0.
- **PDF → 이미지**: 1회 최대 50페이지, 파일 100MB. 렌더 목표 폭 1240px(페이지 비율에 따라 높이 결정).
- **암호가 걸린 PDF**는 지원하지 않고 "암호를 해제한 파일을 다시 선택해 주세요"로 안내합니다(암호 입력 UI 없음).
- **EXIF 제거**는 Canvas 재인코딩(JPEG 품질 0.92 / PNG 무손실)입니다. 회전 정보는 픽셀에 반영되지만 JPEG는 화질이 미세하게 달라질 수 있습니다.
- **모자이크 강도**는 이미지 폭에 비례하는 블록 크기라 미리보기(작은 캔버스)와 저장본(원본 해상도)이 같은 비율로 보입니다.
- **워터마크**는 본인 권리가 있는 이미지에만 사용해야 합니다(앱 안내 문구 포함).
- pdf.js의 JPEG2000 등 특수 기능은 로컬 WASM을 쓰지만, 매우 특수한 폰트/색공간 문서는 근사 렌더링될 수 있습니다.
- 검증은 Chromium 기준입니다. Safari/Firefox 실기기 확인은 아직 하지 않았습니다(표준 Canvas/File/Clipboard API만 사용).
- 폴리필: pdf.js 5.4가 쓰는 `Uint8Array.toHex/fromHex/toBase64/fromBase64`, `Promise.withResolvers`를 앱과 워커에 주입해
  Chromium 130에서도 동작합니다(`src/lib/compat.ts`, `scripts/worker-polyfill.js`).
- 이 컨테이너에는 한국어 폰트가 Noto Sans CJK KR만 있어 스크린샷의 굵기가 실제 안드로이드(로보토/노토)와 미세하게 다를 수 있습니다.
- 워터마크 미리보기 캔버스는 최대 900px, 저장 시 원본 최대 4096px로 처리합니다.

## 재현 방법

```bash
export PATH=/workspace/tooling/node20/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/workspace/tooling/pw-browsers
export LD_LIBRARY_PATH=/workspace/tooling/sysroot/usr/lib/x86_64-linux-gnu

npx tsc --noEmit
npm run build          # pdfjs·라이선스 자산 복사(prebuild) → tsc → vite build
npx vitest run
node e2e/e2e.mjs       # dist를 자체 서버로 서빙해 61개 항목 실측
```

원본 데이터: `e2e/last-report.json`(항목별 상세·요청 목록), 실행 로그 `e2e/run.log`.
