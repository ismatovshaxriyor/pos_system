import { ApiError, apiErrorFromResponse, networkError } from './errors';

export interface ApiClientConfig {
  /** Masalan `http://192.168.1.50:8000` - oxirida `/` va `/api` bo'lmasin. */
  getBaseUrl: () => string | null;
  /** DRF token. Login so'rovlarida yo'q bo'ladi. */
  getToken: () => string | null;
  /** `X-Device-ID` - backend har so'rovda qurilmani qayta tekshiradi. */
  getDeviceId: () => string | null;
  /**
   * Faqat 401 (token yoki qurilma yaroqsiz, masalan revoke qilingan). 403 bu
   * yerga kelmaydi - u "huquq yo'q", sessiya tugamaydi.
   */
  onUnauthorized?: (err: ApiError) => void;
  /** 402 - litsenziya bloklangan. */
  onLicenseBlocked?: (err: ApiError) => void;
  fetchImpl?: typeof fetch;
  /** Restoran WiFi'sida ilinib qolmaslik uchun. Sukut bo'yicha 15s. */
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  /** `true` bo'lsa Authorization yuborilmaydi (login, discovery). */
  anonymous?: boolean;
}

export interface ApiClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  delete<T = void>(path: string, opts?: RequestOptions): Promise<T>;
  /** Rasm kabi nisbiy `/media/...` yo'llarni to'liq URL'ga aylantiradi. */
  absoluteUrl(pathOrUrl: string | null | undefined): string | null;
}

/** LAN nomlari: bularga sxemasiz yozilganda `http://` qo'yiladi. */
const LAN_SUFFIX = /\.(local|lan|home|internal|localhost)$/i;

/**
 * Sxemasiz manzilga sxema qo'yadi. IP, `localhost`, `.local` yoki port ko'rsatilgan manzil (Bola LAN'da) -
 * `http://`. Portsiz ochiq domen (masalan `rohat.hamrohpos.uz`, uydan Cloudflare tunnel orqali kirish) -
 * `https://`: `http://` bilan Cloudflare 301 qaytaradi va POST (login) yo'naltirishda GET'ga aylanib buziladi.
 */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    const host = url.split('/')[0] ?? '';
    const publicDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host) && !LAN_SUFFIX.test(host);
    url = `${publicDomain ? 'https' : 'http'}://${url}`;
  }
  return url.replace(/\/+$/, '').replace(/\/api$/i, '');
}

function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const doFetch = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = config.timeoutMs ?? 15_000;

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const base = config.getBaseUrl();
    if (!base) {
      throw new ApiError({ kind: 'network', status: 0, message: 'Server manzili sozlanmagan.' });
    }
    // DRF `APPEND_SLASH` POST'ni redirect qila olmaydi - yo'l doim `/` bilan tugasin.
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}/api${cleanPath}${buildQuery(opts.query)}`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    // FormData (rasm yuklash): Content-Type'ni qo'ymaymiz - fetch o'zi `multipart/form-data; boundary=...` qo'yadi.
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (!opts.anonymous) {
      const token = config.getToken();
      if (token) headers.Authorization = `Token ${token}`;
    }
    const deviceId = config.getDeviceId();
    if (deviceId) headers['X-Device-ID'] = deviceId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Tashqi signal (masalan ekran yopilganda) ham so'rovni to'xtatsin.
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (cause) {
      throw networkError(cause);
    } finally {
      clearTimeout(timer);
    }

    let payload: unknown = null;
    if (response.status !== 204) {
      const text = await response.text();
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          // Reverse proxy / tunnel HTML xato sahifasi qaytargan bo'lishi mumkin.
          payload = null;
        }
      }
    }

    if (!response.ok) {
      const err = apiErrorFromResponse(response.status, payload);
      // Anonim so'rovlarda (login) 401 "token eskirdi" degani emas.
      if (err.kind === 'unauthorized' && !opts.anonymous) config.onUnauthorized?.(err);
      if (err.kind === 'license_blocked') config.onLicenseBlocked?.(err);
      throw err;
    }
    return payload as T;
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body: body ?? {} }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
    absoluteUrl(pathOrUrl) {
      if (!pathOrUrl) return null;
      if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
      const base = config.getBaseUrl();
      if (!base) return null;
      return `${base}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    },
  };
}
