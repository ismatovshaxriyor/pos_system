import type { Decimal, Role, User } from './types';

/**
 * Boshqaruv (menejer/kassir) ekranlari uchun turlar. Maydonlar backend serializer'lari bilan 1:1
 * (`local_server/core/serializers.py`): yozishda `*_id`, o'qishda ichma-ich obyekt.
 */

/** Galereyadan tanlangan rasm; RN `FormData`ga `{uri, name, type}` ko'rinishida qo'shiladi. */
export interface ImageUpload {
  uri: string;
  name: string;
  type: string;
}

/**
 * JSON yoki multipart tanasini yasaydi. Rasm bo'lsa `FormData` (backend `ImageField`),
 * bo'lmasa oddiy obyekt. `undefined` maydonlar tushirib qoldiriladi; `null` bo'sh qator sifatida
 * yuboriladi (DRF multipart'da `null` qabul qilmaydi - maydonni tozalash uchun bo'sh qator kerak).
 */
export function buildBody(fields: Record<string, string | number | boolean | null | undefined>, image?: ImageUpload | null): unknown {
  if (!image) {
    const json: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) json[k] = v;
    return json;
  }
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    form.append(k, v === null ? '' : String(v));
  }
  form.append('image', image as unknown as Blob);
  return form;
}

// ---- Menyu -----------------------------------------------------------------

export interface ProductInput {
  name: string;
  price: Decimal;
  category_id: number;
  barcode?: string | null;
  /** Tannarx (foyda hisobi uchun). */
  cost_price?: Decimal;
  /** Soliq stavkasi, foizda. */
  tax_rate?: Decimal;
  is_available?: boolean;
}

export interface CategoryInput {
  name: string;
  /** Qaysi printerga chop etiladi; `null` - printersiz. */
  printer_id?: number | null;
}

// ---- Ombor -----------------------------------------------------------------

export type IngredientUnit = 'kg' | 'g' | 'l' | 'ml' | 'dona';
export const INGREDIENT_UNITS: readonly IngredientUnit[] = ['kg', 'g', 'l', 'ml', 'dona'];
export const UNIT_LABEL: Record<IngredientUnit, string> = {
  kg: 'Kilogramm',
  g: 'Gramm',
  l: 'Litr',
  ml: 'Millilitr',
  dona: 'Dona',
};

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  note: string;
  is_active: boolean;
}

export interface SupplierInput {
  name: string;
  /** `+998xxxxxxxxx`; bo'sh bo'lishi mumkin. */
  phone?: string;
  note?: string;
  is_active?: boolean;
}

export interface Ingredient {
  id: number;
  name: string;
  unit: IngredientUnit;
  /** Faqat kirim/sotuv/tuzatish orqali o'zgaradi (read-only). */
  current_stock: Decimal;
  min_stock: Decimal;
  /** Oxirgi kirim narxi (birlik uchun). */
  cost_price: Decimal;
  supplier: Supplier | null;
  is_low: boolean;
  is_active: boolean;
}

export interface IngredientInput {
  name: string;
  unit: IngredientUnit;
  min_stock?: Decimal;
  supplier_id?: number | null;
  is_active?: boolean;
}

export interface IngredientSlim {
  id: number;
  name: string;
  unit: IngredientUnit;
}

/** Retsept qatori: 1 ta mahsulot sotilganda shuncha ingredient sarflanadi. */
export interface RecipeItem {
  id: number;
  product: number;
  ingredient: IngredientSlim;
  quantity: Decimal;
}

export interface PurchaseItem {
  id: number;
  ingredient: IngredientSlim;
  quantity: Decimal;
  unit_cost: Decimal;
}

export interface Purchase {
  id: number;
  supplier: Supplier | null;
  note: string;
  items: PurchaseItem[];
  total_cost: Decimal;
  created_at: string;
}

export interface PurchaseInput {
  supplier_id?: number | null;
  note?: string;
  items: { ingredient_id: number; quantity: Decimal; unit_cost: Decimal }[];
}

export type StockMovementType = 'purchase' | 'sale' | 'adjustment' | 'waste' | 'return';

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  purchase: 'Kirim',
  sale: 'Sotuv',
  adjustment: 'Tuzatish',
  waste: 'Yo‘qotish',
  return: 'Qaytarish',
};

export interface StockMovement {
  id: number;
  ingredient: number;
  ingredient_name: string;
  /** Kirimda musbat, chiqimda manfiy. */
  quantity: Decimal;
  movement_type: StockMovementType;
  order: number | null;
  purchase: number | null;
  note: string;
  created_by: User | null;
  created_at: string;
}

// ---- Zal -------------------------------------------------------------------

export interface TableInput {
  name: string;
  capacity: number;
  zone_id?: number | null;
  is_active?: boolean;
}

// ---- Xodimlar --------------------------------------------------------------

export interface AttendanceRecord {
  id: number;
  user: User;
  check_in: string;
  check_out: string | null;
  check_in_latitude: Decimal | null;
  check_in_longitude: Decimal | null;
  check_out_latitude: Decimal | null;
  check_out_longitude: Decimal | null;
}

/** `GET /attendance/me/` - joriy xodimning ochiq smenasi. */
export interface ShiftStatus {
  on_shift: boolean;
  attendance: AttendanceRecord | null;
}

/** `GET /attendance/summary/` (menejer) - bir xodimning davr bo'yicha jami. */
export interface AttendanceSummaryRow {
  user: User;
  shifts: number;
  /** Ishlagan kunlar soni. */
  days: number;
  /** Jami ishlagan daqiqa (ochiq smena "hozirgacha" hisoblanadi). */
  minutes: number;
  on_shift: boolean;
}

export interface AttendanceSummary {
  from: string;
  to: string;
  staff: AttendanceSummaryRow[];
}

/** 15 daqiqalik bir martalik kod: kassir shu kod bilan o'z qurilmasida PIN o'rnatadi. */
export interface RegistrationCode {
  code: string;
  expires_at: string;
  user: User;
}

export interface StaffInput {
  first_name: string;
  last_name?: string;
  /** Telefon (`+998xxxxxxxxx`) - login nomi. */
  username: string;
  role: Role;
  /** Menejer/ofitsiant uchun majburiy (yaratishda); kassirga berilmaydi (PIN bilan kiradi). */
  password?: string;
}

// ---- Restoran sozlamalari --------------------------------------------------

export interface RestaurantSettings {
  id: number;
  name: string;
  logo: string | null;
  public_domain: string;
  phone: string;
  latitude: Decimal | null;
  longitude: Decimal | null;
  /** Davomat uchun ruxsat etilgan radius (metr). */
  attendance_radius: number;
  /** Xizmat haqi, foizda. */
  service_charge_rate: Decimal;
  /** Qoida: bekor qilingan buyurtma sarfi omborga qaytariladimi (standart: yo'q). */
  restore_stock_on_cancel: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
}

export type RestaurantSettingsInput = Partial<
  Pick<
    RestaurantSettings,
    | 'name'
    | 'public_domain'
    | 'phone'
    | 'latitude'
    | 'longitude'
    | 'attendance_radius'
    | 'service_charge_rate'
    | 'restore_stock_on_cancel'
    | 'telegram_bot_token'
    | 'telegram_chat_id'
  >
>;

// ---- Printerlar ------------------------------------------------------------

export interface PrinterInput {
  name: string;
  /** Bo'sh - virtual printer. Faqat LAN (private) IP qabul qilinadi. */
  ip_address?: string | null;
  port?: number;
  chars_per_line?: number;
  is_active?: boolean;
  is_cashier?: boolean;
}

/** `GET /api/printers/category-options/` */
export interface PrinterCategoryOption {
  id: number;
  name: string;
  printer_id: number | null;
  printer__name: string | null;
}

export type PrintJobStatus = 'pending' | 'printed' | 'failed';
export type PrintJobType = 'kitchen' | 'pre_bill' | 'receipt';

export const JOB_TYPE_LABEL: Record<PrintJobType, string> = {
  kitchen: 'Oshxona cheki',
  pre_bill: 'Hisob-chek',
  receipt: "To'lov cheki",
};

export interface PrintJob {
  id: number;
  printer: number;
  printer_name: string;
  order: number;
  table_name: string;
  waiter_name: string;
  job_type: PrintJobType;
  items_snapshot: unknown;
  status: PrintJobStatus;
  created_at: string;
  updated_at: string;
}

// ---- Mijozlar --------------------------------------------------------------

export interface CustomerInput {
  first_name: string;
  last_name?: string;
  phone?: string;
  note?: string;
  is_active?: boolean;
}
