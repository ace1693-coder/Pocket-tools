/**
 * URL 추적 파라미터 제거 로직 (순수 함수, 브라우저/Node 공용)
 *
 * 원칙: "지우면 안 되는 것"이 "지우고 싶은 것"보다 항상 우선한다.
 * 서명·인증·콘텐츠 식별 파라미터는 이름이 추적 목록과 겹쳐도 보존한다.
 */

export interface ParamEntry {
  key: string;
  value: string;
}

export interface CleanSuccess {
  ok: true;
  /** 프로토콜을 보정한 원본 URL */
  original: string;
  /** 추적 파라미터를 제거한 URL */
  cleaned: string;
  removed: ParamEntry[];
  removedCount: number;
  kept: ParamEntry[];
  protocolAdded: boolean;
  changed: boolean;
}

export interface CleanFailure {
  ok: false;
  error: string;
}

export type CleanOutcome = CleanSuccess | CleanFailure;

/** 절대 지우지 않는 정확한 이름 (소문자 비교) */
const PRESERVE_EXACT = new Set([
  'v',
  'id',
  'page',
  'p',
  'pageid',
  'page_id',
  'q',
  'query',
  'search',
  's',
  'tab',
  'sort',
  'filter',
  'category',
  'cat',
  'code',
  'state',
  'token',
  'nonce',
  'signature',
  'expires',
  'policy',
  'key-pair-id',
  'access_token',
  'refresh_token',
  'id_token',
  'session',
  'sessionid',
  'sid',
  'hash',
  'sig',
  'hmac',
  'ts',
  'timestamp',
  'start',
  'end',
  'lang',
  'locale',
  'region',
  'country',
  'currency',
  'size',
  'color',
  'type',
  'mode',
  'view',
  'list',
  'index',
  'offset',
  'limit',
  'time',
  'date',
  'year',
  'month',
  'day',
  'hl',
  'gl',
  'num',
  'startindex',
]);

/** 절대 지우지 않는 접두사 (소문자 비교) */
const PRESERVE_PREFIX = ['x-amz-', 'x-goog-', 'x-oss-', 'x-ms-', 'x-auth-', 'awsaccesskeyid'];

/** 이름에 이 조각이 들어가면 서명/인증 파라미터로 보고 보존한다 */
const PRESERVE_KEYWORDS = ['signature', 'token', 'credential', 'expires', 'policy', 'sig'];

/** 지우는 추적 파라미터 정확한 이름 (소문자 비교) */
const TRACKING_EXACT = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'wbraid',
  'gbraid',
  'msclkid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'yclid',
  'ysclid',
  'epik',
  'srsltid',
  'igshid',
  'igsh',
  'si',
  'ref_src',
  'ref_url',
  'spm',
  'scm',
  '_ga',
  '_gl',
  '_gac',
  'ga_source',
  'ga_medium',
  'ga_campaign',
  'ga_content',
  'ga_term',
  'mkt_tok',
  'vero_id',
  'vero_conv',
  '_hsenc',
  '_hsmi',
  'hsctatracking',
  'mc_cid',
  'mc_eid',
  'oly_anon_id',
  'oly_enc_id',
  'sc_cid',
  's_cid',
  'cmpid',
  'ncid',
  'breeze',
  'gs_l',
  'gad_source',
  'wickedid',
  'irclickid',
  'rb_clickid',
  's_kwcid',
  'ef_id',
  'elqtrackid',
  'elqtrack',
  '_openstat',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  'fb_ref',
  'action_object_map',
  'action_type_map',
  'action_ref_map',
  '__hssc',
  '__hstc',
  '__hsfp',
  'hsCtaTracking',
  'spm_id_from',
  'vd_source',
  'share_source',
  'share_medium',
  'share_plat',
  'share_session_id',
  'share_tag',
  'unique_k',
  'from_source',
]);

/** 지우는 추적 파라미터 접두사 (소문자 비교) */
const TRACKING_PREFIX = [
  'utm_',
  'mtm_',
  'pk_',
  'piwik_',
  'matomo_',
  'hsa_',
  'fb_',
  'ig_',
  'mc_',
  'oly_',
  'vero_',
];

/** 값이 있어도 URL 동작에 영향이 없는 순수 추적 파라미터 */
export function isTrackingParam(rawKey: string): boolean {
  const key = rawKey.trim().toLowerCase();
  if (!key) return false;
  if (isEssentialParam(key)) return false;
  if (TRACKING_EXACT.has(key)) return true;
  return TRACKING_PREFIX.some((prefix) => key.startsWith(prefix));
}

/** 정상 동작에 필요해 절대 지우면 안 되는 파라미터인지 */
export function isEssentialParam(rawKey: string): boolean {
  const key = rawKey.trim().toLowerCase();
  if (!key) return false;
  if (PRESERVE_EXACT.has(key)) return true;
  if (key.startsWith('x-amz-') || key.startsWith('x-goog-') || key.startsWith('x-oss-')) return true;
  if (PRESERVE_PREFIX.some((prefix) => key.startsWith(prefix))) return true;
  return PRESERVE_KEYWORDS.some((word) => key.includes(word));
}

function decodePart(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

export function cleanUrl(rawInput: string): CleanOutcome {
  const raw = rawInput.trim();
  if (!raw) return { ok: false, error: 'URL을 입력해 주세요.' };
  if (raw.length > 8000) return { ok: false, error: 'URL이 너무 깁니다. 8000자 이하로 입력해 주세요.' };

  if (/^(javascript|data|file|ftp|blob|mailto):/i.test(raw)) {
    return { ok: false, error: 'http:// 또는 https:// 주소만 정리할 수 있습니다.' };
  }

  let protocolAdded = false;
  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      return { ok: false, error: 'http:// 또는 https:// 주소만 정리할 수 있습니다.' };
    }
    candidate = `https://${raw}`;
    protocolAdded = true;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return {
      ok: false,
      error: '올바른 URL이 아닙니다. 주소 전체를 붙여넣어 주세요. (예: https://example.com/?utm_source=news)',
    };
  }

  const host = url.hostname;
  const looksLikeDomain = host.includes('.') || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (!host || !looksLikeDomain) {
    return {
      ok: false,
      error: '도메인 형식이 올바르지 않습니다. 주소를 다시 확인해 주세요. (예: https://example.com)',
    };
  }
  if (/\s/.test(host)) {
    return {
      ok: false,
      error: '올바른 URL이 아닙니다. 주소에 공백이 들어가 있습니다. 다시 확인해 주세요.',
    };
  }

  const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  const kept: ParamEntry[] = [];
  const removed: ParamEntry[] = [];
  const keptPairs: string[] = [];

  if (rawQuery) {
    for (const pair of rawQuery.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      const key = decodePart(rawKey);
      const value = decodePart(rawValue);
      if (isTrackingParam(key)) {
        removed.push({ key, value });
      } else {
        kept.push({ key, value });
        keptPairs.push(pair);
      }
    }
  }

  const search = keptPairs.length ? `?${keptPairs.join('&')}` : '';
  const origin = url.origin === 'null' ? '' : url.origin;
  const cleaned = `${origin}${url.pathname}${search}${url.hash}`;
  const original = url.toString();

  return {
    ok: true,
    original,
    cleaned,
    removed,
    removedCount: removed.length,
    kept,
    protocolAdded,
    changed: cleaned !== original,
  };
}

/** 화면 표시용 짧은 URL (너무 길면 줄임) */
export function shorten(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
