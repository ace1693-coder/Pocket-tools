# Pocket Tools — 실제 배포 URL 검증 기록

- 배포일: 2026-11-21 (KST)
- 배포 주소: **https://ace1693-coder.github.io/Pocket-tools/**
- 저장소: https://github.com/ace1693-coder/Pocket-tools (public) — `main` = 소스, `gh-pages` = 배포 빌드
- 배포 방식: GitHub Pages "Deploy from a branch" → `gh-pages` / `/ (root)`
- 검증 스크립트: `e2e/live-check.mjs` (결과 원본: `deploy-evidence/live-check-report.json`)

> 저장소 이름이 대문자 `Pocket-tools`로 만들어져 URL도 `/Pocket-tools/`입니다. GitHub Pages는 경로 대소문자를 구분하므로
> 소문자 `https://ace1693-coder.github.io/pocket-tools/`는 **현재 404**입니다. 저장소 이름을 `pocket-tools`로 바꾸면
> 소문자 주소가 정상 주소가 됩니다(Settings → General → Repository name → Rename). 사이트는 상대 경로로 빌드되어
> 이름을 바꿔도 그대로 동작합니다.

## 검증 조건

- Chromium(Playwright 1.48.2, headless) · **모바일 뷰포트 390×844** · DPR 3 · `isMobile`·`hasTouch` · ko-KR · Asia/Seoul
- 대상: 실제 배포된 HTTPS URL (로컬 서버 아님)
- 결과: **23개 항목 전부 통과** · 외부 오리진 요청 **0건** · 콘솔 에러 **0건** · 페이지 에러 **0건**
- 스크린샷: `10-mobile-390-tabs.png` ~ `15-mobile-390-reload.png` (390×844, DPR 3)

## 결과 (실측)

| 구분 | 항목 | 결과 | 실측값 |
| --- | --- | --- | --- |
| 기본 | HTTPS 첫 로드 | 통과 | HTTP 200 · 268ms · `https://ace1693-coder.github.io/Pocket-tools/` |
| 기본 | 모바일 뷰포트 | 통과 | innerWidth 390 · innerHeight 844 · dpr 3 |
| 기본 | 가로 스크롤 0 | 통과 | scrollWidth 390 ≤ clientWidth 390 |
| 탭 | 7개 탭 진입 | 통과 | URL 정리 · 이미지 압축 · 비율 조정 · PDF ↔ 이미지 · EXIF·모자이크 · 워터마크 · QR 생성 — 각 탭 패널 표시, 전부 가로 스크롤 390/390 |
| URL | 추적 파라미터 제거 | 통과 | "추적 파라미터 5개를 제거했습니다. 필수 파라미터 2개는 그대로 보존했습니다." → `https://shop.example.com/item/4821?id=4821&page=2#review` |
| 이미지 | 압축 + 다운로드 | 통과 | 1.09 MB → 447 KB(−60.0%) · 내려받은 `test-photo-압축.jpg` 457,274B · JPEG 1600×1200 |
| QR | 생성 + PNG 다운로드 | 통과 | 1024×1024 PNG · jsQR 디코드 결과 `https://ace1693-coder.github.io/Pocket-tools/` |
| PDF | 이미지 → PDF + 다운로드 | 통과 | 1,306,500B · 2페이지 · 1600×1200pt, 800×600pt |
| PDF | PDF → 이미지 렌더 | 통과 | 같은 PDF 재업로드 → 2페이지 렌더(1240×930) |
| EXIF | 메타데이터 검출 | 통과 | 11개 항목 · GPS 37.570000° N 126.978056° E · PocketCam PC-2026 · 2026-11-20 15:04:05 |
| EXIF | 제거 후 파일 검사 | 통과 | 358,823B · exifr 태그 **0개** · `Exif\0\0` APP1 마커 **없음** |
| 보안 | 외부 오리진 요청 | 통과 | **0건** (업로드·압축·PDF 렌더·QR 전 과정, pdf.js 워커 포함 전부 자체 오리진) |
| PWA | Service Worker | 통과 | scope `/Pocket-tools/` · activated · 문서 제어(controlled) |
| PWA | Manifest | 통과 | `display: standalone` · 아이콘 192×192 / 512×512 / maskable 512×512 |
| 재로드 | 새로고침 후 동작 | 통과 | 새 문서 로드 후에도 탭·정리 기능·SW 제어 정상 |
| 안정성 | 콘솔·페이지 에러 | 통과 | 콘솔 0건 · 페이지 에러 0건 |

## 제약·미확인

1. **저장소 이름 대소문자**: 현재 URL은 `/Pocket-tools/`. 소문자 `/pocket-tools/`는 404이며 저장소 이름 변경으로 해결됩니다.
2. **GitHub Actions 자동 배포 미적용**: 연결된 GitHub 앱에 `workflows` 권한이 없어 `.github/workflows/deploy.yml`을 푸시할 수 없습니다
   (`refusing to allow a GitHub App to create or update workflow`). 현재는 `gh-pages` 브랜치 배포이며, 워크플로 파일은 저장소에 없습니다.
3. **실기기 미확인**: 검증은 headless Chromium의 모바일 에뮬레이션(390×844, DPR 3, touch)입니다.
   Android Chrome / iOS Safari 실제 기기에서의 렌더링·다운로드·홈 화면 추가·설치 프롬프트는 확인하지 않았습니다.
