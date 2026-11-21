import { useEffect, useState } from 'react';
import UrlCleaner from './components/UrlCleaner';
import ImageCompressor from './components/ImageCompressor';
import RatioResizer from './components/RatioResizer';
import PdfImageConverter from './components/PdfImageConverter';
import ExifMosaic from './components/ExifMosaic';
import Watermark from './components/Watermark';
import QrGenerator from './components/QrGenerator';

type TabKey = 'url' | 'image' | 'ratio' | 'pdf' | 'exif' | 'wm' | 'qr';

const TABS: { key: TabKey; label: string; icon: JSX.Element }[] = [
  {
    key: 'url',
    label: 'URL 정리',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.4 1.4M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: 'image',
    label: '이미지 압축',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="8.5" cy="10" r="1.6" fill="currentColor" />
        <path d="M4.5 17.5 9.5 12l3 3.2 2.4-2.2 4.6 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'ratio',
    label: '비율 조정',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" />
        <rect x="8" y="8" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    ),
  },
  {
    key: 'pdf',
    label: 'PDF ↔ 이미지',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13 3.5v5h5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.5 13.5h6M8.5 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'exif',
    label: 'EXIF·모자이크',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 9h3M8 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13 12h3v3h-3zM13 15h3v3h-3zM16 12h3v3h-3zM12 15h1v1h-1z" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'wm',
    label: '워터마크',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 16.5 9.6 10h1.2l2.6 6.5M8 14.2h4.4M15.5 10v6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'qr',
    label: 'QR 생성',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19.5h1.5V20H14zM19 14h1v1.5h-1z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const TAB_STORAGE_KEY = 'pocket-tools:tab';
const TAB_KEYS = TABS.map((tab) => tab.key);

function readInitialTab(): TabKey {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (saved && (TAB_KEYS as string[]).includes(saved)) return saved as TabKey;
  } catch {
    /* 저장소를 못 쓰는 환경은 기본 탭 */
  }
  return 'url';
}

export default function App() {
  const [tab, setTab] = useState<TabKey>(readInitialTab);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      /* 무시 */
    }
  }, [tab]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const swUrl = new URL('sw.js', document.baseURI).href;
    const register = () => {
      navigator.serviceWorker.register(swUrl).catch(() => {
        /* 오프라인 캐시는 부가 기능이므로 실패해도 앱은 동작한다 */
      });
    };
    // 이미 load가 끝난 뒤에 마운트되는 경우(빠른 로드·재방문)에도 등록되도록 한다.
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="26" height="26">
              <rect x="6" y="9" width="20" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <path d="M12 9V7.5A2.5 2.5 0 0 1 14.5 5h3A2.5 2.5 0 0 1 20 7.5V9M11 15h10M16 15v5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1>Pocket Tools</h1>
            <p className="brand-sub">링크 · 사진 · PDF · QR</p>
          </div>
        </div>
        <p className="privacy-badge" title="모든 처리는 이 기기 안에서만 이루어집니다">
          <span className="dot" aria-hidden="true" />
          기기 안에서만 처리
        </p>
      </header>

      <nav className="tool-tabs" role="tablist" aria-label="도구 선택">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`panel-${item.key}`}
            className={`tool-tab${tab === item.key ? ' tool-tab-active' : ''}`}
            onClick={() => setTab(item.key)}
            data-testid={`tab-${item.key}`}
          >
            <span className="tool-tab-icon">{item.icon}</span>
            <span className="tool-tab-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">
        <div className="tab-panel" role="tabpanel" id="panel-url" aria-labelledby="tab-url" hidden={tab !== 'url'}>
          <UrlCleaner />
        </div>
        <div className="tab-panel" role="tabpanel" id="panel-image" aria-labelledby="tab-image" hidden={tab !== 'image'}>
          <ImageCompressor />
        </div>
        <div className="tab-panel" role="tabpanel" id="panel-ratio" aria-labelledby="tab-ratio" hidden={tab !== 'ratio'}>
          <RatioResizer />
        </div>
        <div className="tab-panel" role="tabpanel" id="panel-pdf" aria-labelledby="tab-pdf" hidden={tab !== 'pdf'}>
          <PdfImageConverter />
        </div>
        <div className="tab-panel" role="tabpanel" id="panel-exif" aria-labelledby="tab-exif" hidden={tab !== 'exif'}>
          <ExifMosaic />
        </div>
        <div className="tab-panel" role="tabpanel" id="panel-wm" aria-labelledby="tab-wm" hidden={tab !== 'wm'}>
          <Watermark />
        </div>
        <div className="tab-panel" role="tabpanel" id="panel-qr" aria-labelledby="tab-qr" hidden={tab !== 'qr'}>
          <QrGenerator />
        </div>

        <p className="app-footnote">
          서버·계정·광고 없음. 입력한 URL·사진·PDF·문구는 네트워크로 전송되지 않고 브라우저 안에서만 처리됩니다.
        </p>
      </main>
    </div>
  );
}
