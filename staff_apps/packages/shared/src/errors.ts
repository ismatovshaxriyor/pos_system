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

/**
 * Server (yoki oraliq proksi) matn qaytarmagan holat uchun tushunarli standart xabar.
 * HTML xato sahifasi, bo'sh javob, eski server versiyasi - hammasida foydalanuvchi nima qilishni bilishi kerak.
 */
export function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return "Ma'lumotlar noto'g'ri kiritilgan.";
    case 401:
      return 'Sessiya tugagan. Qaytadan kiring.';
    case 402:
      return "Tizim bloklangan. To'lovni amalga oshiring.";
    case 403:
      return "Bu amalni bajarishga ruxsatingiz yo'q.";
    case 404:
      return "Topilmadi. Restoran serveri eski versiyada bo'lishi mumkin - uni yangilang.";
    case 405:
      return "Bu amalni server qo'llab-quvvatlamaydi. Restoran serverini yangilang.";
    case 408:
    case 504:
      return "Server javob berishga ulgurmadi. Birozdan keyin qayta urinib ko'ring.";
    case 409:
      return "Bu amalni hozir bajarib bo'lmaydi (yozuv boshqa joyda ishlatilgan).";
    case 413:
      return 'Fayl juda katta.';
    case 429:
      return "Juda ko'p urinish. Birozdan keyin qayta urining.";
    case 502:
    case 503:
      return "Restoran tizimi hozir ishlamayapti. Birozdan keyin qayta urinib ko'ring.";
    default:
      return status >= 500
        ? "Tizimda nosozlik yuz berdi. Birozdan keyin qayta urinib ko'ring."
        : `Amalni bajarib bo'lmadi (xato kodi ${status}).`;
  }
}

/**
 * Serverning inglizcha standart (DRF/Django) xabarlari -> o'zbekcha. Yangi server buni o'zi o'giradi, lekin
 * ilova serverdan oldin yangilanishi mumkin (yoki oraliqda proksi bor) - shuning uchun ilova ham biladi.
 * Faqat TO'LIQ mos kelsa almashtiradi: serverning o'z o'zbekcha xabarlariga tegmaydi.
 */
const EN_TO_UZ: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Unable to log in with provided credentials\.$/, "Telefon raqami yoki parol noto'g'ri."],
  [/^Must include "username" and "password"\.$/, 'Telefon raqam va parolni kiriting.'],
  [/^This field is required\.$/, "Bu maydon to'ldirilishi shart."],
  [/^This field may not be (?:null|blank)\.$/, "Bu maydon bo'sh bo'lishi mumkin emas."],
  [/^Not a valid string\.$/, 'Matn kiriting.'],
  [/^A valid integer is required\.$/, 'Butun son kiriting.'],
  [/^A valid number is required\.$/, 'Son kiriting.'],
  [/^Must be a valid boolean\.$/, "Ha yoki yo'q qiymati kerak."],
  [/^Enter a valid email address\.$/, "Email manzili noto'g'ri."],
  [/^Enter a valid URL\.$/, "Havola (URL) noto'g'ri."],
  [/^Enter a valid IPv[46](?: or IPv[46])? address\.$/, "IP manzil noto'g'ri."],
  [/^Ensure this field has no more than (\d+) characters\.$/, "Ko'pi bilan $1 ta belgi bo'lishi mumkin."],
  [/^Ensure this field has at least (\d+) characters\.$/, "Kamida $1 ta belgi bo'lishi kerak."],
  [/^Ensure this value is less than or equal to (.+)\.$/, 'Qiymat $1 dan oshmasligi kerak.'],
  [/^Ensure this value is greater than or equal to (.+)\.$/, "Qiymat kamida $1 bo'lishi kerak."],
  [/^Ensure that there are no more than (\d+) digits in total\.$/, 'Raqamlar soni jami $1 tadan oshmasligi kerak.'],
  [/^Ensure that there are no more than (\d+) decimal places?\.$/, "Kasr qismida ko'pi bilan $1 ta raqam bo'lishi mumkin."],
  [/^Ensure that there are no more than (\d+) digits before the decimal point\.$/, "Butun qismida ko'pi bilan $1 ta raqam bo'lishi mumkin."],
  [/^".*" is not a valid choice\.$/, "Tanlangan qiymat ruxsat etilganlar ichida yo'q."],
  [/^Invalid pk ".*" - object does not exist\.$/, 'Tanlangan yozuv topilmadi.'],
  [/^Incorrect type\. Expected pk value, received .*\.$/, "Qiymat turi noto'g'ri."],
  [/^Datetime has wrong format\..*$/, "Sana va vaqt formati noto'g'ri."],
  [/^Date has wrong format\..*$/, "Sana formati noto'g'ri."],
  [/^Time has wrong format\..*$/, "Vaqt formati noto'g'ri."],
  [/^Expected a list of items but got type ".*"\.$/, "Ro'yxat kerak."],
  [/^This list may not be empty\.$/, "Ro'yxat bo'sh bo'lmasligi kerak."],
  [/^Invalid data\. Expected a dictionary, but got .*\.$/, "So'rov ma'lumoti noto'g'ri formatda."],
  [/^This field must be unique\.$/, 'Bunday qiymat allaqachon mavjud.'],
  [/^.+ with this .+ already exists\.$/, 'Bunday yozuv allaqachon mavjud.'],
  [/^Invalid token(?: header.*)?\.$/, 'Sessiya yaroqsiz yoki tugagan. Qaytadan kiring.'],
  [/^Authentication credentials were not provided\.$/, 'Tizimga kirilmagan. Qaytadan kiring.'],
  [/^Incorrect authentication credentials\.$/, 'Kirish maʼlumotlari yaroqsiz. Qaytadan kiring.'],
  [/^User inactive or deleted\.$/, "Akkaunt faol emas yoki o'chirilgan."],
  [/^You do not have permission to perform this action\.$/, "Bu amalni bajarishga ruxsatingiz yo'q."],
  [/^Not found\.$/, 'Topilmadi.'],
  [/^No .+ matches the given query\.$/, 'Topilmadi.'],
  [/^Method ".*" not allowed\.$/, "Bu so'rov turi qo'llab-quvvatlanmaydi."],
  [/^Request was throttled\. Expected available in (\d+) seconds?\.$/, "Juda ko'p urinish. $1 soniyadan keyin qayta urining."],
  [/^Request was throttled\.$/, "Juda ko'p urinish. Birozdan keyin qayta urining."],
  [/^(?:Malformed request|JSON parse error.*)\.?$/, "So'rov ma'lumoti noto'g'ri formatda."],
  [/^Unsupported media type.*$/, "So'rov turi qo'llab-quvvatlanmaydi."],
  [/^Order already completed or cancelled\.?$/, 'Buyurtma allaqachon yopilgan yoki bekor qilingan.'],
  [/^Enter a valid .+\.$/, "Qiymat noto'g'ri kiritilgan."],
];

export function localizeMessage(msg: string): string {
  for (const [re, uz] of EN_TO_UZ) if (re.test(msg)) return msg.replace(re, uz);
  return msg;
}

/** Maydonning ichki nomi -> foydalanuvchiga ko'rinadigan nom (xato matnida "Parol: ..." deb chiqadi). */
const FIELD_LABELS: Record<string, string> = {
  username: 'Telefon raqam',
  phone: 'Telefon raqam',
  phone_number: 'Telefon raqam',
  password: 'Parol',
  new_password: 'Yangi parol',
  pin: 'PIN',
  code: 'Kod',
  device_id: 'Qurilma',
  first_name: 'Ism',
  last_name: 'Familiya',
  role: 'Lavozim',
  name: 'Nomi',
  price: 'Narx',
  cost_price: 'Tannarx',
  tax_rate: 'Soliq',
  barcode: 'Shtrix-kod',
  category: 'Toifa',
  category_id: 'Toifa',
  product: 'Taom',
  product_id: 'Taom',
  items: 'Taomlar',
  quantity: 'Miqdor',
  unit: "O'lchov birligi",
  amount: 'Summa',
  method: "To'lov turi",
  table: 'Stol',
  table_id: 'Stol',
  zone: 'Zona',
  guest_count: 'Mehmonlar soni',
  note: 'Izoh',
  discount_amount: 'Chegirma',
  discount_reason: 'Chegirma sababi',
  customer: 'Mijoz',
  due_date: 'Qaytarish sanasi',
  ip_address: 'IP manzil',
  port: 'Port',
  chars_per_line: 'Qator uzunligi',
  latitude: 'Kenglik',
  longitude: 'Uzunlik',
  attendance_radius: 'Radius',
  license_key: 'Litsenziya kaliti',
  key: 'Litsenziya kaliti',
  sort_order: 'Tartib raqami',
  telegram_bot_token: 'Telegram bot tokeni',
  telegram_chat_id: 'Telegram chat ID',
  service_rate: 'Xizmat haqi',
};

/** Foydalanuvchiga ko'rsatilmaydigan texnik kalitlar (ularning xabari o'z-o'zidan tushunarli). */
const HIDDEN_FIELDS = new Set(['non_field_errors', 'detail', '__all__', 'id', 'sync_uuid']);

export function fieldLabel(key: string): string {
  if (HIDDEN_FIELDS.has(key)) return '';
  const known = FIELD_LABELS[key];
  if (known) return known;
  const human = key.replace(/_/g, ' ').trim();
  return human ? human.charAt(0).toUpperCase() + human.slice(1) : '';
}

/**
 * DRF maydon xatolarini `{maydon: [matn, ...]}` ko'rinishiga keltiradi. Ichma-ich tuzilma
 * (`items: [{product_id: ["..."]}]`) ham tekislanadi - aks holda "[object Object]" chiqib qolardi.
 */
function normalizeFields(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (key: string, value: unknown): void => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      (out[key] ??= []).push(localizeMessage(String(value)));
    } else if (Array.isArray(value)) {
      for (const v of value) add(key, v);
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(/^\d+$/.test(k) ? key : k, v);
    }
  };
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) add(k, v);
  }
  return out;
}

/** Server yuboradigan umumiy sarlavhalar: ular o'zi ma'lumot bermaydi - o'rniga maydon xatosi ko'rsatiladi. */
const GENERIC_DETAILS = new Set(['Validatsiya xatosi.', "Ma'lumotlar to'g'ri kiritilmagan."]);

/** Umumiy xabar + maydon xatolaridan foydalanuvchiga ko'rsatiladigan YAGONA matn ("Parol: Bu maydon to'ldirilishi shart."). */
export function composeMessage(detail: string, fields: Record<string, string[]>): string {
  const parts = Object.entries(fields)
    .filter(([, msgs]) => msgs.length > 0)
    .slice(0, 3)
    .map(([key, msgs]) => {
      const label = fieldLabel(key);
      return label ? `${label}: ${msgs[0]}` : msgs[0]!;
    });
  if (parts.length === 0) return detail;
  return GENERIC_DETAILS.has(detail) ? parts.join(' ') : `${detail} ${parts.join(' ')}`;
}

export function apiErrorFromResponse(status: number, body: unknown): ApiError {
  const parsed = (body && typeof body === 'object' ? body : {}) as ApiErrorBody;
  const fields = normalizeFields(parsed.fields);
  const detail =
    typeof parsed.detail === 'string' && parsed.detail
      ? localizeMessage(parsed.detail)
      : defaultMessageForStatus(status);
  return new ApiError({ kind: kindForStatus(status), status, message: composeMessage(detail, fields), code: parsed.code, fields });
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

/** Foydalanuvchiga ko'rsatish uchun yagona matn (`ApiError.message` allaqachon umumiy xabar + maydon xatosini o'z ichiga oladi). */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || 'Nomaʼlum xatolik.';
  return 'Nomaʼlum xatolik.';
}
