/**
 * Backend xato formati (`core/exceptions.py::custom_exception_handler`):
 *   { "detail": "...", "code": "...", "fields": { "<maydon>": ["..."] } }
 * `licensing` middleware esa bloklangan tizimda `402 {"detail": "..."}` qaytaradi.
 */

export interface ApiErrorBody {
  detail?: string;
  code?: string;
  fields?: Record<string, unknown>;
}

export type ApiErrorKind =
  /** Server javob bermadi (tarmoq uzilgan, timeout, noto'g'ri manzil). */
  | 'network'
  /** 401 - token yoki qurilma yaroqsiz (revoke, eskirgan token): sessiya tugaydi. */
  | 'unauthorized'
  /**
   * 403 - tizimga kirgan, lekin bu amalga huquqi yo'q (masalan ofitsiant
   * `set_discount` chaqirdi) YOKI waiter-login'da menejer tasdig'i kutilmoqda.
   * Sessiyani tugatmaydi!
   */
  | 'forbidden'
  /** 402 - litsenziya bloklangan (kill-switch). */
  | 'license_blocked'
  /** 429 - PIN/throttle limiti. */
  | 'rate_limited'
  /** 400 + maydon xatolari. */
  | 'validation'
  /** 5xx. */
  | 'server'
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly fields: Record<string, string[]>;

  constructor(opts: {
    kind: ApiErrorKind;
    status: number;
    message: string;
    code?: string;
    fields?: Record<string, string[]>;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.kind = opts.kind;
    this.status = opts.status;
    this.code = opts.code;
    this.fields = opts.fields ?? {};
  }

  /** Internet yo'qligi - offline rejimga o'tish yoki qayta urinish kerak. */
  get isNetwork(): boolean {
    return this.kind === 'network';
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 402) return 'license_blocked';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** DRF maydon xatolarini `{maydon: [matn, ...]}` ko'rinishiga keltiradi. */
function normalizeFields(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.map(String);
    else if (value != null) out[key] = [String(value)];
  }
  return out;
}

export function apiErrorFromResponse(status: number, body: unknown): ApiError {
  const parsed = (body && typeof body === 'object' ? body : {}) as ApiErrorBody;
  const fields = normalizeFields(parsed.fields);
  const detail =
    typeof parsed.detail === 'string' && parsed.detail
      ? parsed.detail
      : status >= 500 ? 'Tizimda nosozlik yuz berdi. Birozdan keyin qayta urinib ko\'ring.' : 'Amalni bajarib bo\'lmadi.';
  return new ApiError({ kind: kindForStatus(status), status, message: detail, code: parsed.code, fields });
}

export function networkError(cause?: unknown): ApiError {
  const timedOut = cause instanceof Error && cause.name === 'AbortError';
  return new ApiError({
    kind: 'network',
    status: 0,
    message: timedOut
      ? "Restoran tizimi javob bermadi. WiFi'ni tekshiring."
      : "Restoran tizimiga ulanib bo'lmadi. WiFi'ni tekshiring.",
  });
}

/** Foydalanuvchiga ko'rsatish uchun yagona matn: umumiy xabar + birinchi maydon xatosi. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const firstField = Object.entries(err.fields)[0];
    // Maydonning ichki nomi (`customer`, `sync_uuid`...) foydalanuvchiga ko'rsatilmaydi - faqat xabar matni.
    if (firstField && firstField[1][0]) return `${err.message} ${firstField[1][0]}`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Nomaʼlum xatolik.';
}
