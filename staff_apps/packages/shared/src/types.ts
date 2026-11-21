/**
 * Backend (`local_server/core/serializers.py`) javoblariga mos tiplar.
 *
 * Diqqat: DRF `DecimalField` sukut bo'yicha summani STRING sifatida qaytaradi
 * ("45000.00"), son sifatida emas. Shuning uchun pul maydonlari `Decimal`
 * (brended string) - hisob-kitob uchun `money.ts::toNumber` ishlating.
 */

export type Decimal = string;

export type Role = 'manager' | 'cashier' | 'waiter';

export interface User {
  id: number;
  /** Telefon raqam (`+998xxxxxxxxx`) - login nomi. */
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface TableZone {
  id: number;
  name: string;
}

/**
 * `free` - bo'sh; `occupied_by_me` - so'rovchi ofitsiantning o'z buyurtmasi;
 * `occupied` - boshqa xodimniki. Holat so'rovchiga nisbiy, shuning uchun
 * WebSocket orqali tayyor holda kelmaydi - `table_status_changed` kelganda
 * qayta so'rash kerak.
 */
export type TableStatus = 'free' | 'occupied_by_me' | 'occupied';

export interface Table {
  id: number;
  name: string;
  capacity: number;
  is_active: boolean;
  status: TableStatus;
  zone: TableZone | null;
}

export interface Printer {
  id: number;
  name: string;
  ip_address: string | null;
  port: number;
  chars_per_line: number;
  is_active: boolean;
  /** Kassa printeri: hisob-chek (shot) va to'lov cheklari shundan chiqadi. */
  is_cashier: boolean;
}

export interface Category {
  id: number;
  name: string;
  image: string | null;
  printer: Printer | null;
}

export interface Product {
  id: number;
  category: Category;
  sync_uuid: string;
  name: string;
  price: Decimal;
  barcode: string | null;
  image: string | null;
  is_available: boolean;
  cost_price: Decimal;
  tax_rate: Decimal;
}

export type OrderItemStatus = 'new' | 'preparing' | 'ready' | 'served';

export interface OrderItem {
  id: number;
  product: Product;
  quantity: number;
  /** Narx serverda `Product.price`'dan olinadi - klient yubormaydi. */
  price: Decimal;
  status: OrderItemStatus;
  note: string;
  modifiers: Record<string, unknown>;
  is_voided: boolean;
}

export type PaymentMethod = 'cash' | 'card' | 'other';

export interface Payment {
  id: number;
  amount: Decimal;
  method: PaymentMethod;
  received_by: User | null;
  created_at: string;
  is_voided: boolean;
  refunded_of: number | null;
  reference: string;
}

export type OrderStatus = 'new' | 'in_progress' | 'completed' | 'cancelled';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export interface CustomerSlim {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
}

/** Xodim qurilmasi (`GET /api/devices/`, faqat menejer). `is_active && !is_approved` = menejer tasdig'i kutilmoqda. */
export interface StaffDevice {
  id: number;
  user: User;
  device_id: string;
  device_label: string;
  is_active: boolean;
  is_approved: boolean;
  last_login_at: string | null;
  created_at: string;
}

/** Menejerga (yoki shaxsan o'ziga) kelgan bildirishnoma (`GET /api/notifications/`). */
export interface AppNotification {
  id: number;
  notif_type: string;
  message: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

/** Qarz daftar mijozi (`GET /api/customers/`). `balance` > 0 = mijoz restoranga qarzdor. Faqat kassir/menejer ko'radi. */
export interface Customer extends CustomerSlim {
  note: string;
  balance: Decimal;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DebtTxnType = 'credit_sale' | 'repayment' | 'adjustment';

export interface DebtTransaction {
  id: number;
  customer: number;
  amount: Decimal;
  txn_type: DebtTxnType;
  order: number | null;
  method: string;
  note: string;
  /** Qarz qachon qaytarilishi kerak (`YYYY-MM-DD`), faqat `credit_sale` uchun. */
  due_date: string | null;
  created_by: User | null;
  created_at: string;
}

export interface Order {
  id: number;
  sync_uuid: string;
  table: Table | null;
  waiter: User | null;
  cashier: User | null;
  customer: CustomerSlim | null;
  order_type: OrderType;
  total_amount: Decimal;
  tax_amount: Decimal;
  service_charge: Decimal;
  discount_amount: Decimal;
  discount_reason: string;
  final_amount: Decimal;
  amount_paid: Decimal;
  balance_due: Decimal;
  status: OrderStatus;
  note: string;
  guest_count: number;
  items: OrderItem[];
  payments: Payment[];
  created_at: string;
}

export interface RegisterSession {
  id: number;
  is_open: boolean;
  opened_at: string | null;
  opened_by: number | null;
  opened_by_name: string | null;
  closed_at: string | null;
  closed_by: number | null;
  closed_by_name: string | null;
  /** Faqat `close` javobida: avto-checkout qilingan xodimlar soni. */
  checked_out_count?: number;
}

/** `GET /api/bootstrap/` - ilova ishga tushganda yagona yirik so'rov. */
/** Buyurtma shabloni: ko'p takrorlanadigan taomlar to'plami (bir bosishda qoralamaga qo'shiladi). */
export interface OrderTemplateItem {
  id: number;
  product_id: number;
  quantity: number;
  note: string;
}

export interface OrderTemplate {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  items: OrderTemplateItem[];
}

export interface OrderTemplateInput {
  name: string;
  sort_order?: number;
  is_active?: boolean;
  items: { product_id: number; quantity: number; note?: string }[];
}

export interface Bootstrap {
  user: User;
  categories: Category[];
  products: Product[];
  table_zones: TableZone[];
  tables: Table[];
  /**
   * Ofitsiant uchun faqat o'zining ochiq buyurtmalari; kassir/menejer uchun
   * hammasi.
   */
  active_orders: Order[];
  register_open: boolean;
  /** Faol shablonlar. Eski server (shablon qo'llab-quvvatlamaydigan) bu maydonni yubormaydi - `?? []`. */
  order_templates?: OrderTemplate[];
}

/** DRF `PageNumberPagination` (sahifa hajmi 50). */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** `GET /api/discovery/` - ochiq ping, topilgan manzil haqiqiy Bola ekanini tekshiradi. */
export interface DiscoveryInfo {
  service: 'pos-bola';
  /** Eski serverlar yuboradi; yangilari ataylab yubormaydi (versiya begonaga kerak emas). */
  version?: string;
  activated: boolean;
  restaurant_id: string | null;
  restaurant_name: string;
  is_blocked: boolean;
  server_time: string;
}

/** Login javoblari (`pin-login`, `waiter-login`, `device/register`). */
export interface AuthResponse {
  token: string;
  user: User;
}

// ---- Real-time (WebSocket `ws/events/`) -------------------------------------

/**
 * Backend'dagi `broadcast_event(event_type, payload)` chaqiruvlari. Payload'lar
 * ataylab yengil "qayta so'ra" signallari. Noma'lum event turlarini
 * e'tiborsiz qoldirish kerak - backend yangi tur qo'shsa ilova sinmasligi uchun.
 */
export type KnownEventName =
  | 'ping'
  | 'table_status_changed'
  | 'order_updated'
  | 'price_changed'
  | 'discount_applied'
  | 'low_stock'
  | 'new_print_job'
  | 'print_job_updated'
  | 'register_closed'
  | 'register_opened'
  // Model yozilganda server avtomatik yuboradi (local_server/core/realtime_signals.py).
  | 'menu_changed'
  | 'staff_changed'
  | 'devices_changed'
  | 'attendance_changed'
  | 'customers_changed'
  | 'inventory_changed'
  | 'printers_changed'
  | 'config_changed';

export interface WsEvent<D = Record<string, unknown>> {
  event: KnownEventName | (string & {});
  data: D;
}

/** Serverning WebSocket yopish kodlari (`core/consumers.py`). */
export const WsCloseCode = {
  /** Token/qurilma yaroqsiz. */
  Unauthorized: 4001,
  /** Litsenziya bloklangan. */
  LicenseBlocked: 4402,
  /** Qurilma revoke qilindi / yangi qurilma tasdiqlandi. */
  DeviceRevoked: 4403,
} as const;
