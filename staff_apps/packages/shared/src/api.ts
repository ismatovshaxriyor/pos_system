import type { AppUpdateInfo, AppUpdatePlatform } from './appupdate';
import type { ApiClient } from './client';
import type {
  DashboardReport,
  DateRange,
  DayEndReport,
  DebtsReport,
  InventoryReport,
  SalesGroupBy,
  SalesReport,
  StaffReport,
} from './reports';
import type {
  AppNotification,
  AuthResponse,
  Bootstrap,
  Customer,
  DebtTransaction,
  Decimal,
  DiscoveryInfo,
  Order,
  OrderType,
  Paginated,
  PaymentMethod,
  Payment,
  RegisterSession,
  StaffDevice,
  User,
} from './types';

export interface ActionStatus {
  status: string;
}

export interface OrderItemInput {
  product_id: number;
  quantity?: number;
  note?: string;
  modifiers?: Record<string, unknown>;
}

/**
 * Backend endpoint'larining yupqa, tiplangan qatlami. Ataylab sodda funksiyalar
 * (klass/hook emas) - ikkala ilova ham o'z holat boshqaruvi (React Query/store)
 * ustidan ishlata oladi.
 */
export function createApi(client: ApiClient) {
  return {
    // ---- Auth (hammasi anonim) -------------------------------------------
    auth: {
      /** Menejer (is_staff): telefon (=username) + parol, qurilmaga bog'lanmaydi. Faqat token qaytaradi. */
      managerLogin: (phone: string, password: string) =>
        client.post<{ token: string }>('/auth/login/', { username: phone, password }, { anonymous: true }),

      /** Ofitsiant: telefon + parol + qurilma (TOFU). Yangi qurilmada 403 - menejer tasdig'i kerak. */
      waiterLogin: (p: { phone: string; password: string; device_id: string; device_label?: string }) =>
        client.post<AuthResponse>('/auth/waiter-login/', p, { anonymous: true }),

      /** Kassir: kassa planshetida 6 xonali PIN. 5 ta xato → 429 (5 daqiqa). */
      pinLogin: (p: { device_id: string; pin: string }) =>
        client.post<AuthResponse>('/auth/pin-login/', p, { anonymous: true }),

      /** Birinchi marta: menejer bergan bir martalik kod + o'zi tanlagan PIN. */
      registerDevice: (p: { phone: string; code: string; device_id: string; pin: string; device_label?: string }) =>
        client.post<AuthResponse>('/auth/device/register/', p, { anonymous: true }),

      me: () => client.get<User>('/users/me/'),
    },

    discovery: () => client.get<DiscoveryInfo>('/discovery/', { anonymous: true }),

    /**
     * "Yangi versiya bormi?" - avtorizatsiyasiz va litsenziya blokidan tashqarida (majburiy yangilanish
     * bloklangan tizimda ham, login'dan oldin ham yetib borishi uchun).
     */
    appUpdate: (q: { slugs: string[]; platform: AppUpdatePlatform; current: string }) =>
      client.get<AppUpdateInfo>('/license/app-updates/', {
        anonymous: true,
        query: { slugs: q.slugs.join(','), platform: q.platform, current: q.current },
      }),

    bootstrap: () => client.get<Bootstrap>('/bootstrap/'),

    // ---- Buyurtmalar -----------------------------------------------------
    orders: {
      list: (query?: { date?: string; status?: string; page?: number }) =>
        client.get<Paginated<Order>>('/orders/', { query }),
      get: (id: number) => client.get<Order>(`/orders/${id}/`),

      /**
       * `sync_uuid`ni klient yaratadi: javob yo'qolib qayta yuborilsa server
       * mavjud buyurtmani `200` bilan qaytaradi (dublikat ochilmaydi).
       * Kassa yopiq bo'lsa 400.
       */
      create: (p: { sync_uuid: string; table_id?: number | null; order_type?: OrderType; guest_count?: number; note?: string }) =>
        client.post<Order>('/orders/', p),

      // DIQQAT: `start`/`add_item`/`close`/`cancel` to'liq Order EMAS, faqat
      // `{status: "..."}` qaytaradi - yangilangan holat uchun `orders.get(id)`
      // (yoki WS `order_updated` kelganda qayta so'rash) ishlating.

      /** `new → in_progress`; oshxonaga chek ketadi. */
      start: (id: number) => client.post<ActionStatus>(`/orders/${id}/start/`),
      /** Bir xil mahsulot qayta qo'shilsa serverda mavjud qator miqdori oshadi. Massiv ham qabul qiladi. */
      addItem: (id: number, item: OrderItemInput | OrderItemInput[]) =>
        client.post<ActionStatus>(`/orders/${id}/add_item/`, item),
      addPayment: (id: number, p: { amount: Decimal; method: PaymentMethod; reference?: string }) =>
        client.post<Payment>(`/orders/${id}/add_payment/`, p),
      /** To'liq to'langan bo'lishi shart (`balance_due == 0`). */
      close: (id: number) => client.post<ActionStatus>(`/orders/${id}/close/`),
      /** Qarzga yopish (kassir/menejer). Muddat `YYYY-MM-DD`, ixtiyoriy. */
      closeOnCredit: (id: number, p: { customer_id: number; due_date?: string | null }) =>
        client.post<Order>(`/orders/${id}/close-on-credit/`, p),
      /** Faqat menejer; `completed` buyurtmani bekor qilib bo'lmaydi. */
      cancel: (id: number) => client.post<ActionStatus>(`/orders/${id}/cancel/`),
      /** Faqat menejer. */
      setDiscount: (id: number, p: { discount_amount: Decimal; discount_reason?: string }) =>
        client.post<Order>(`/orders/${id}/set_discount/`, p),
      printPreBill: (id: number) => client.post<unknown>(`/orders/${id}/print-pre-bill/`),
      printReceipt: (id: number) => client.post<unknown>(`/orders/${id}/print-receipt/`),
    },

    // ---- Qarz daftar (kassir/menejer; ofitsiantga yopiq) -----------------
    customers: {
      /** `search` ism/familya/telefon bo'yicha; qarzdorlar tepada. */
      list: (query?: { search?: string; has_debt?: boolean; page?: number }) =>
        client.get<Paginated<Customer>>('/customers/', {
          query: { search: query?.search || undefined, has_debt: query?.has_debt ? 'true' : undefined, page: query?.page },
        }),
      create: (p: { first_name: string; last_name?: string; phone?: string; note?: string }) =>
        client.post<Customer>('/customers/', p),
      transactions: (id: number) => client.get<DebtTransaction[]>(`/customers/${id}/transactions/`),
      /** To'lov summasi joriy qarzdan oshsa 400. */
      repay: (id: number, p: { amount: Decimal; method?: PaymentMethod; note?: string }) =>
        client.post<Customer>(`/customers/${id}/repay/`, p),
    },

    // ---- Hisobotlar (faqat menejer; `date` = 'today' yoki YYYY-MM-DD) -----
    reports: {
      /** Kassir yoki menejer; faqat bugun. */
      dayEnd: () => client.get<DayEndReport>('/reports/day-end/'),
      dashboard: (date?: string) => client.get<DashboardReport>('/reports/dashboard/', { query: { date } }),
      sales: (range: DateRange, groupBy: SalesGroupBy) =>
        client.get<SalesReport>('/reports/sales/', { query: { from: range.from, to: range.to, group_by: groupBy } }),
      staff: (range: DateRange) => client.get<StaffReport>('/reports/staff/', { query: { from: range.from, to: range.to } }),
      debts: () => client.get<DebtsReport>('/reports/debts/'),
      inventory: () => client.get<InventoryReport>('/reports/inventory/'),
    },

    // ---- Xodim qurilmalari (faqat menejer) ------------------------------
    devices: {
      list: (query?: { page?: number }) => client.get<Paginated<StaffDevice>>('/devices/', { query }),
      /** Yangi qurilmani tasdiqlaydi (ofitsiant keyingi kirishda o'tadi). */
      approve: (id: number) => client.post<StaffDevice>(`/devices/${id}/approve/`),
      /** Token o'chadi va ochiq WS darhol uziladi; qurilma qayta kirsa yana tasdiq so'raydi. */
      revoke: (id: number) => client.post<{ detail: string }>(`/devices/${id}/revoke/`),
    },

    notifications: {
      list: (query?: { page?: number }) => client.get<Paginated<AppNotification>>('/notifications/', { query }),
      markRead: (id: number) => client.post<{ status: string }>(`/notifications/${id}/mark_read/`),
    },

    // ---- Kassa ochish/yopish (kassir yoki menejer) ------------------------
    register: {
      close: () => client.post<RegisterSession>('/register-session/close/'),
      open: () => client.post<RegisterSession>('/register-session/open/'),
    },
  };
}

export type PosApi = ReturnType<typeof createApi>;
