# Pocket Tools — 실제 배포 URL 검증 기록

- 배포일: 2026-11-21 (KST)
- 배포 주소: **https://ace1693-coder.github.io/Pocket-tools/**
- 저장소: https://github.com/ace1693-coder/Pocket-tools (public, `main` = 소스 / `gh-pages` = 배포 빌드)
- 방식: GitHub Pages "Deploy from a branch" → `gh-pages` 브랜치 (main 푸시 시 자동 빌드는 `.github/workflows/deploy.yml` 참고 — 아래 제약 참조)

> 저장소 이름이 대문자 `Pocket-tools`로 만들어져 URL도 `/Pocket-tools/`입니다. GitHub Pages는 경로 대소문자를 구분하므로
> 소문자 `https://ace1693-coder.github.io/pocket-tools/`는 **현재 404**입니다. 저장소 이름을 `pocket-tools`로 바꾸면
> 소문자 주소가 정상 주소가 됩니다(설정 → General → Repository name → Rename).

## 검증 환경

- 실제 배포된 HTTPS URL을 브라우저(Chrome, 원격 세션)로 직접 열어 확인.
- 브라우저 창 크기가 1920×993으로 고정되어 있어 390×844를 그대로 재현할 수 없었습니다.
  대신 브라우저 줌 500%로 CSS 폭 **384px**(390보다 좁음)에서 레이아웃을 측정했습니다. 세로 844는 재현하지 못했습니다.
- 증빙 이미지: `deploy-evidence/01~05*.png`

## 결과 요약 (실측)

| 항목 | 결과 | 실측 증빙 |
| --- | --- | --- |
| HTTPS 접속 | 통과 | HTTP/2 200, `content-type: text/html`, 인증서 정상 |
| 7개 탭 진입 | 통과 | URL 정리 / 이미지 압축 / 비율 조정 / PDF ↔ 이미지 / EXIF·모자이크 / 워터마크 / QR 생성 모두 렌더링 |
| 가로 스크롤 | 통과 | CSS 폭 381(클라이언트) = 381(스크롤 폭), 탭 84px × 7개가 4+3 두 줄 배치 |
| URL 추적 제거 | 통과 | 예시 URL에서 추적 5개 제거(`utm_source`·`utm_medium`·`utm_campaign`·`fbclid`·`igshid`), 필수 2개(`id`·`page`) 보존 → `https://shop.example.com/item/4821?id=4821&page=2#review` |
| 이미지 압축 + 다운로드 | 통과 | 1.09MB → 447KB(−60%), 1600×1200, 69ms. 내려받은 `test-photo-압축.jpg` 457,274B, JPEG(FFD8) 1600×1200 |
| QR 생성 + PNG 다운로드 | 통과 | 45자 → 1024×1024 PNG 27,249B. jsQR 디코드 결과 `https://ace1693-coder.github.io/pocket-tools/` |
| 이미지 → PDF + 다운로드 | 통과 | 사진 2장 → 2페이지 PDF 1,306,500B (1쪽 1600×1200pt, 2쪽 800×600pt), pdf-lib 재파싱 확인 |
| PDF → 이미지 + 다운로드 | 통과 | 위 PDF 재업로드 → 2페이지 1240×930 렌더, 1쪽 PNG 2,548,425B |
| EXIF 제거 | 통과 | 11개 메타데이터(GPS 37.57/126.9781, PocketCam PC-2026, 2026-11-20 15:04:05) 검출 → 저장 후 내려받은 파일 358,823B, exifr 태그 **0개**, `Exif\0\0` APP1 마커 **없음** |
| 외부 전송 0건 | 통과 | 업로드·압축·PDF 렌더 후 Performance Resource Timing 6건 전부 동일 오리진(`/Pocket-tools/assets/*`, `/pdfjs/pdf.worker.min.mjs`). 외부 오리진 **0건** |
| Service Worker | 통과 | `activated`, scope `https://ace1693-coder.github.io/Pocket-tools/`, 문서 제어(controlled) 상태 |
| Manifest | 통과 | 200 `application/manifest+json`, `display: standalone`, start_url/scope `./`, 아이콘 192·512·maskable 512 모두 200 |
| 새로고침 후 동작 | 통과 | 새 문서 로드 후에도 탭·기능 정상(URL 정리 재실행 5개 제거/2개 보존), SW 재제어 |
| PWA 설치 조건 | 충족 | HTTPS + 192/512 아이콘 + standalone + fetch 핸들러 있는 SW. 실기기 설치 프롬프트는 미확인 |

## 제약·미확인

1. **저장소 이름 대소문자**: URL이 `/Pocket-tools/`. 소문자 `/pocket-tools/`는 404이며, 저장소 이름을 바꿔야 합니다.
2. **GitHub Actions 자동 배포 미적용**: 연결된 GitHub 앱에 `workflows` 권한이 없어 `.github/workflows/deploy.yml`을 푸시할 수 없습니다
   (`refusing to allow a GitHub App to create or update workflow`). 현재는 `gh-pages` 브랜치 배포입니다.
   워크플로 파일은 저장소에 커밋되어 있지 않으며 `projects/pocket-tools/.github/workflows/deploy.yml`에 있습니다.
3. **모바일 뷰포트**: 원격 브라우저 창이 1920×993 고정이라 390×844 실측이 아니라 CSS 폭 384px로 측정했습니다.
4. **실기기 미확인**: Android Chrome / iOS Safari 실제 기기에서의 렌더링·다운로드·홈 화면 추가는 확인하지 않았습니다.
