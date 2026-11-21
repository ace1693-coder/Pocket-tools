# Pocket Tools — 모바일 올인원 도구 PWA

스마트폰에서 자주 쓰는 일곱 가지 자잘한 일을 한 화면에서 끝내는 **정적 PWA 웹앱**입니다.
서버·DB·회원가입·광고가 없고, 입력한 URL·사진·PDF·문구는 **브라우저 밖으로 나가지 않습니다**.
외부 CDN·API 요청은 0건이며, 오프라인에서도 앱 셸이 열립니다.

| 도구 | 기능 |
| --- | --- |
| URL 정리 | 공유 링크의 광고·추적 파라미터(utm_*, fbclid, gclid, igshid, si, spm …)만 제거. 상품 번호·서명·인증 파라미터는 보존 |
| 이미지 압축 | JPG · PNG · WebP를 Canvas로 다시 인코딩. 품질 10~100%, 출력 형식 선택, 전후 용량·절감률·해상도 표시 |
| 사진 비율 조정 | 1:1 · 4:5 · 9:16 · 16:9. **잘림 방지(여백)** vs **꽉 채우기(중앙 크롭)**, 여백 배경 검정/흰색/흐린 원본, PNG·JPEG·WebP 출력, 전후 해상도·용량 |
| PDF ↔ 이미지 | PDF 각 페이지를 PNG/JPEG로 **실제 렌더링**(개별·전체 ZIP) / 여러 사진을 **순서 변경·삭제** 후 실제 PDF로 결합(원본 크기·A4 맞춤) |
| EXIF 제거 · 모자이크 | 사진의 GPS·카메라·촬영일시 표시 → 캔버스 드래그로 모자이크 영역 지정(다중·되돌리기·강도) → 저장 직전 결과 바이트를 **다시 EXIF 파서로 검사해 0건 증빙** 후 다운로드 |
| 워터마크 | 텍스트 또는 로고 이미지, 투명도 10~100%, 위치 6종(5개 고정 + 격자 반복), 여러 장 일괄 적용 → ZIP + 개별 다운로드 |
| QR 생성 | 링크·문구를 1024×1024 PNG QR로 생성. 이미지 복사(Clipboard API) 또는 PNG 다운로드 |

## 구조

```
pocket-tools/
├─ index.html                 # 메타 태그(PWA/테마/애플), 엔트리
├─ public/
│  ├─ manifest.webmanifest    # 앱 이름·아이콘·standalone·세로 고정
│  ├─ sw.js                   # 앱 셸 오프라인 캐시 v2 (상대 경로 → 하위 경로 배포 대응)
│  ├─ icons/                  # icon-192, icon-512, icon-maskable-512
│  ├─ pdfjs/                  # pdf.js 워커(+폴리필)·표준폰트·CMap·WASM·ICC (빌드 시 복사)
│  └─ licenses/               # 배포물에 포함되는 오픈소스 라이선스 원문
├─ scripts/
│  ├─ gen-icons.mjs            # 아이콘 PNG 생성기 (의존성 없이 zlib로 직접 인코딩)
│  ├─ copy-pdfjs-assets.mjs    # pdf.js 자산 → public/pdfjs (+워커 폴리필 주입)
│  ├─ worker-polyfill.js       # pdf.js 워커용 최신 내장 메서드 폴리필
│  └─ copy-licenses.mjs        # 라이선스 원문 복사
├─ src/
│  ├─ App.tsx                  # 헤더 · 7개 도구 탭 메뉴(4+3 배치) · Service Worker 등록
│  ├─ components/
│  │  ├─ UrlCleaner.tsx / ImageCompressor.tsx / QrGenerator.tsx      # 1차
│  │  ├─ RatioResizer.tsx      # ④
│  │  ├─ PdfImageConverter.tsx # ⑤ (PDF→이미지 / 이미지→PDF)
│  │  ├─ ExifMosaic.tsx        # ⑥
│  │  ├─ Watermark.tsx         # ⑦
│  │  └─ ui.tsx                # 공용 파일 입력·세그먼트·슬라이더·오류
│  ├─ lib/
│  │  ├─ urlCleaner.ts / imageCompress.ts / qr.ts / clipboard.ts / format.ts
│  │  ├─ ratio.ts              # 비율·여백/크롭 계산 (순수)
│  │  ├─ mosaic.ts             # 정규화 영역·블록 평균 모자이크 (순수)
│  │  ├─ watermark.ts          # 위치·격자·투명도 계산 (순수)
│  │  ├─ watermarkDraw.ts      # 미리보기·저장 공용 Canvas 그리기
│  │  ├─ exif.ts               # EXIF 파싱·세그먼트 스캔·제거 검증
│  │  ├─ pdfImages.ts          # pdf-lib PDF 생성 (순수, 지연 로딩)
│  │  ├─ pdfPrepare.ts         # 업로드 사진 → PDF 임베드 바이트(EXIF 회전 보정)
│  │  ├─ pdfRender.ts          # pdf.js 렌더링 (지연 로딩, 로컬 워커)
│  │  ├─ zip.ts                # JSZip 묶음 (지연 로딩)
│  │  ├─ canvasImage.ts        # 디코딩·Canvas·다운로드 공용
│  │  └─ compat.ts             # Uint8Array/Promise 최신 내장 메서드 폴리필
│  └─ lib/*.test.ts            # 단위 테스트(vitest) 84개
├─ e2e/e2e.mjs                 # 실제 Chromium 모바일 뷰포트 E2E 60개 항목 (자체 정적 서버)
├─ screenshots/                # 검증 시 캡처한 모바일 화면
├─ dist/                       # 프로덕션 빌드 결과 (배포 대상)
├─ VERIFICATION.md             # 실제 검증 결과표
└─ LICENSES.md                 # 오픈소스 버전·라이선스
```

## 실행

```bash
npm install          # 최초 1회
npm run dev          # 개발 서버
npm run build        # pdf.js 자산·라이선스 복사 → tsc --noEmit → vite build
npm run preview      # 빌드 결과 미리보기 (4173)
npm test             # 단위 테스트 84개
npm run test:e2e     # 빌드 후 실제 Chromium E2E 60개 항목
npm run icons        # 아이콘 PNG 재생성
```

`npm run test:e2e`는 Playwright Chromium이 필요합니다(`npx playwright install chromium`).
E2E는 `dist/`를 자체 정적 서버로 서빙해 **루트(/)와 하위 경로(/pocket-tools/)** 둘 다 검증합니다.

### 이 작업 환경(샌드박스)에서 실행할 때

Node가 PATH에 없고 Chromium 공유 라이브러리가 분리되어 있어 아래 환경변수가 필요합니다.

```bash
export PATH=/workspace/tooling/node20/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/workspace/tooling/pw-browsers
export LD_LIBRARY_PATH=/workspace/tooling/sysroot/usr/lib/x86_64-linux-gnu
npm run build && node e2e/e2e.mjs
```

## 설계 메모

- **보존 우선 원칙**: 파라미터 이름이 제거 목록과 겹치더라도 `v, id, page, q, query, search, tab, sort, code, state,
  token, Signature, X-Amz-*, Expires, Policy, Key-Pair-Id` 등 서명·인증·콘텐츠 식별 값은 남깁니다(`lib/urlCleaner.ts`).
- **정적 배포 호환**: `vite.config.ts`의 `base: '/pocket-tools/'` + manifest의 `start_url/scope: "./"` + SW의 상대 경로 캐시로
  GitHub Pages `/pocket-tools/` 하위 경로에서 동작합니다(로컬 루트 확인은 `VITE_BASE=/`).
- **네트워크 0건**: 폰트·아이콘·스크립트·pdf.js 워커/폰트/CMap/WASM 모두 자체 번들 또는 로컬 파일. E2E에서 외부 요청 0건을 확인합니다.
- **무거운 라이브러리는 지연 로딩**: pdf.js(446KB)·pdf-lib(438KB)·JSZip·exifr는 해당 도구를 처음 쓸 때만 내려받습니다.
  첫 화면 번들은 249KB(gzip 83KB)입니다.
- **7개 탭 UI**: 가로 스크롤 없이 4+3 배치(360/390/430px에서 문서 폭 초과 0). 각 탭은 86px 폭, 라벨 잘림 없음.
- **EXIF 제거 증빙**: 저장 직전 생성된 Blob 바이트를 ① exifr 재파싱 ② JPEG APP1/PNG eXIf/WebP EXIF 세그먼트 직접 스캔으로
  이중 검사해 화면에 수치(0건)를 표시합니다.
- **개인정보**: 업로드한 이미지·PDF·QR 입력은 `blob:`/Canvas/메모리에만 존재하고 서버로 전송되지 않습니다.
- **접근성/모바일**: 48px 이상 터치 영역, `role="tablist"/"tabpanel"`, 캔버스 드래그는 Pointer Event로 터치·마우스 동시 지원,
  `prefers-reduced-motion` 대응.

## 알려진 제한

- 이미지 최대 40MB(워터마크 로고 10MB), QR 내용 최대 1200자, PDF 최대 100MB·50페이지.
- **암호가 걸린 PDF**는 지원하지 않습니다(해제 후 사용 안내).
- PNG는 무손실 형식이라 다시 저장해도 용량이 거의 줄지 않습니다. 이 경우 WebP/JPEG를 권장합니다.
- **EXIF 제거는 Canvas 재인코딩**이라 JPEG는 화질이 미세하게 달라질 수 있습니다(품질 0.92). 회전 정보는 픽셀에 반영됩니다.
- PDF → 이미지 렌더는 목표 폭 1240px입니다(인쇄용 고해상도 아님).
- 워터마크는 **본인 권리가 있는 이미지**에만 사용해야 합니다.
- 이미지 복사는 Clipboard API 지원 브라우저(Chrome/Edge, Safari 13.1+)에서만 됩니다.
- iOS는 홈 화면 추가 시에만 standalone이고, 캐시는 Safari 정책에 따라 정리될 수 있습니다.
- 검증은 Chromium 기준입니다. Safari/Firefox 실기기는 아직 확인하지 않았습니다.
- 화면은 세로(390×844) 기준으로 최적화했습니다.

## 배포

**https://ace1693-coder.github.io/Pocket-tools/** (GitHub Pages, 무료)

- 저장소: https://github.com/ace1693-coder/Pocket-tools (public) — `main` = 소스, `gh-pages` = 빌드 결과(배포 대상).
- Pages 설정: Settings → Pages → Deploy from a branch → `gh-pages` / `/ (root)`.
- `vite.config.ts`의 `base`는 `/pocket-tools/`(하위 경로)로 고정되어 있고, 로컬에서 루트로 확인하려면 `VITE_BASE=/ npm run build`로 덮어씁니다.
  저장소 이름 대소문자가 바뀔 수 있는 환경에서는 `VITE_BASE=./ npm run build`(상대 경로)를 쓰면 경로가 깨지지 않습니다.
- Actions 자동 빌드·배포를 쓰려면 `.github/workflows/deploy.yml`을 저장소에 추가하고 Pages Source를 "GitHub Actions"로 바꾸면 됩니다
  (연결된 GitHub 앱에 workflows 권한이 없어 이 저장소에는 커밋되지 않은 상태입니다).
- `dist/`를 다른 정적 호스팅에 직접 올려도 됩니다(이때는 그 호스팅의 하위 경로에 맞춰 `VITE_BASE` 지정).
- 실제 배포 URL 검증 기록: [deploy-evidence/VERIFICATION-LIVE.md](./deploy-evidence/VERIFICATION-LIVE.md)

## 라이선스

런타임 의존성은 MIT(pdf.js는 Apache-2.0, JSZip은 MIT 선택)입니다. 버전·원문 위치는 [LICENSES.md](./LICENSES.md)를 참고하세요.
