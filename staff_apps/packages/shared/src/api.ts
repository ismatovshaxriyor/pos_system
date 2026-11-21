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
  Category,
  Customer,
  DebtTransaction,
  Decimal,
  DiscoveryInfo,
  Order,
  OrderType,
  Paginated,
  PaymentMethod,
  Payment,
  Printer,
  OrderTemplate,
  OrderTemplateInput,
  Product,
  RegisterSession,
  StaffDevice,
  Table,
  TableZone,
  User,
} from './types';
import {
  buildBody,
  type AttendanceRecord,
  type AttendanceSummary,
  type ShiftStatus,
  type CategoryInput,
  type CustomerInput,
  type ImageUpload,
  type Ingredient,
  type IngredientInput,
  type PrintJob,
  type PrinterCategoryOption,
  type PrinterInput,
  type ProductInput,
  type Purchase,
  type PurchaseInput,
  type RecipeItem,
  type RegistrationCode,
  type RestaurantSettings,
  type RestaurantSettingsInput,
  type StaffInput,
  type StockMovement,
  type StockMovementType,
  type Supplier,
  type SupplierInput,
  type TableInput,
} from './manage';

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
  /** DRF sahifalangan ro'yxatning barcha sahifalarini yig'adi (sahifa hajmi 50, xavfsizlik uchun 40 sahifagacha). */
  async function listAll<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= 40; page++) {
      const res = await client.get<Paginated<T>>(path, { query: { ...query, page } });
      all.push(...res.results);
      if (!res.next) break;
    }
    return all;
  }

  /** Logo faqat rasm bilan multipart, aks holda oddiy JSON. Koordinata `null` bo'lsa multipart'da bo'sh qator ketadi. */
  const buildLogoBody = (p: RestaurantSettingsInput, logo?: ImageUpload | null): unknown => {
    if (!logo) return p;
    const data = new FormData();
    for (const [k, v] of Object.entries(p)) if (v !== undefined) data.append(k, v === null ? '' : String(v));
    data.append('logo', logo as unknown as Blob);
    return data;
  };

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

    license: {
      /** Yangi serverni litsenziya kaliti bilan faollashtirish (Bola Ona bilan gaplashadi - sekinroq bo'lishi mumkin). */
      activate: (licenseKey: string) =>
        client.post<{ restaurant: { id: string; name: string } }>('/license/activate/', { license_key: licenseKey }, { anonymous: true }),
    },

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
      create: (p: CustomerInput) => client.post<Customer>('/customers/', p),
      /** Ism, telefon, izoh; qarzi bor mijozni faolsizlantirish serverda tekshiriladi. */
      update: (id: number, p: Partial<CustomerInput>) => client.patch<Customer>(`/customers/${id}/`, p),
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

    // ---- Menyu: mahsulot, bo'lim, retsept (yozish: menejer) -------------
    menu: {
      products: () => listAll<Product>('/products/'),
      /** `image` berilsa multipart (backend `ImageField`) yuboriladi. */
      createProduct: (p: ProductInput, image?: ImageUpload | null) => client.post<Product>('/products/', buildBody({ ...p }, image)),
      updateProduct: (id: number, p: Partial<ProductInput>, image?: ImageUpload | null) =>
        client.patch<Product>(`/products/${id}/`, buildBody({ ...p }, image)),
      /** Soft-delete: menyudan yo'qoladi, eski buyurtmalar saqlanadi. */
      deleteProduct: (id: number) => client.delete(`/products/${id}/`),
      createCategory: (p: CategoryInput, image?: ImageUpload | null) => client.post<Category>('/categories/', buildBody({ ...p }, image)),
      updateCategory: (id: number, p: Partial<CategoryInput>, image?: ImageUpload | null) =>
        client.patch<Category>(`/categories/${id}/`, buildBody({ ...p }, image)),
      /** DIQQAT: bo'lim o'chsa mahsulotlari ham o'chadi (sotilgan bo'lsa server xato beradi). */
      deleteCategory: (id: number) => client.delete(`/categories/${id}/`),
      /** Bitta mahsulot retsepti (1 porsiyaga ketadigan ingredientlar). */
      recipe: (productId: number) => listAll<RecipeItem>('/recipe-items/', { product: productId }),
      addRecipeItem: (p: { product_id: number; ingredient_id: number; quantity: Decimal }) => client.post<RecipeItem>('/recipe-items/', p),
      updateRecipeItem: (id: number, p: { quantity: Decimal }) => client.patch<RecipeItem>(`/recipe-items/${id}/`, p),
      deleteRecipeItem: (id: number) => client.delete(`/recipe-items/${id}/`),
    },

    // ---- Buyurtma shablonlari (yozish: menejer; ofitsiant bootstrap'dan oladi) --------
    templates: {
      list: () => listAll<OrderTemplate>('/order-templates/'),
      create: (p: OrderTemplateInput) => client.post<OrderTemplate>('/order-templates/', p),
      /** `items` berilsa taomlar butunlay almashtiriladi. */
      update: (id: number, p: Partial<OrderTemplateInput>) => client.patch<OrderTemplate>(`/order-templates/${id}/`, p),
      delete: (id: number) => client.delete(`/order-templates/${id}/`),
    },

    // ---- Ombor (yozish: kassir yoki menejer; o'qish: hamma xodim) --------
    inventory: {
      ingredients: () => listAll<Ingredient>('/ingredients/'),
      createIngredient: (p: IngredientInput) => client.post<Ingredient>('/ingredients/', p),
      updateIngredient: (id: number, p: Partial<IngredientInput>) => client.patch<Ingredient>(`/ingredients/${id}/`, p),
      deleteIngredient: (id: number) => client.delete(`/ingredients/${id}/`),
      /** Inventarizatsiya/yo'qotish: `new_quantity` (absolyut) YOKI `delta` (nisbiy) - bittasi. */
      adjust: (id: number, p: { new_quantity?: Decimal; delta?: Decimal; note?: string }) =>
        client.post<Ingredient>(`/ingredients/${id}/adjust/`, p),
      suppliers: () => listAll<Supplier>('/suppliers/'),
      createSupplier: (p: SupplierInput) => client.post<Supplier>('/suppliers/', p),
      updateSupplier: (id: number, p: Partial<SupplierInput>) => client.patch<Supplier>(`/suppliers/${id}/`, p),
      deleteSupplier: (id: number) => client.delete(`/suppliers/${id}/`),
      purchases: (query?: { page?: number }) => client.get<Paginated<Purchase>>('/purchases/', { query }),
      /** Kirim: zaxira va tannarx (birlik narxi) darhol yangilanadi. Bir hujjatda bir nechta ingredient. */
      purchase: (p: PurchaseInput) => client.post<Purchase>('/purchases/', p),
      /** Ombor harakati daftari (faqat menejer). */
      movements: (query?: { ingredient?: number; movement_type?: StockMovementType; page?: number }) =>
        client.get<Paginated<StockMovement>>('/stock-movements/', { query }),
    },

    // ---- Zal: stol va zonalar (faqat menejer) ----------------------------
    floor: {
      /** Faolsizlari ham keladi (bootstrap faqat ishlatiladiganlarni beradi). */
      tables: () => listAll<Table>('/tables/'),
      createTable: (p: TableInput) => client.post<Table>('/tables/', p),
      updateTable: (id: number, p: Partial<TableInput>) => client.patch<Table>(`/tables/${id}/`, p),
      /** DIQQAT: buyurtma tarixi bor stolni o'chirib bo'lmaydi - `is_active=false` ishlating. */
      deleteTable: (id: number) => client.delete(`/tables/${id}/`),
      /** Stol QR kodi (PNG) manzili; rasm so'rovida `Authorization` sarlavhasi kerak. */
      qrCodeUrl: (id: number) => `/tables/${id}/qr-code/`,
      createZone: (p: { name: string }) => client.post<TableZone>('/table-zones/', p),
      updateZone: (id: number, p: { name: string }) => client.patch<TableZone>(`/table-zones/${id}/`, p),
      /** Zona o'chsa stollari zonasiz qoladi (o'chmaydi). */
      deleteZone: (id: number) => client.delete(`/table-zones/${id}/`),
    },

    // ---- Restoran sozlamalari (o'qish: hamma, yozish: menejer) -----------
    settings: {
      get: () => client.get<RestaurantSettings>('/restaurant-config/1/'),
      update: (p: RestaurantSettingsInput, logo?: ImageUpload | null) =>
        client.patch<RestaurantSettings>('/restaurant-config/1/', buildLogoBody(p, logo)),
      /** Token/chat bo'sh bo'lsa saqlangani ishlatiladi. */
      testTelegram: (p?: { telegram_bot_token?: string; telegram_chat_id?: string }) =>
        client.post<{ status?: string; detail?: string }>('/restaurant-config/test-telegram/', p ?? {}),
    },

    // ---- Printerlar (oshxona cheklari) -----------------------------------
    printers: {
      list: () => listAll<Printer>('/printers/'),
      create: (p: PrinterInput) => client.post<Printer>('/printers/', p),
      update: (id: number, p: Partial<PrinterInput>) => client.patch<Printer>(`/printers/${id}/`, p),
      delete: (id: number) => client.delete(`/printers/${id}/`),
      categoryOptions: () => client.get<PrinterCategoryOption[]>('/printers/category-options/'),
      /** Printerga aynan shu bo'limlar bog'lanadi (qolganlari bo'shatiladi). */
      setCategories: (id: number, categoryIds: number[]) =>
        client.post<{ status: string }>(`/printers/${id}/set-categories/`, { category_ids: categoryIds }),
      /** Jismoniy printerga test chek yuboradi; IP yo'q (virtual) bo'lsa 400, ulanmasa 502. */
      testPrint: (id: number) => client.post<{ status: string }>(`/printers/${id}/test-print/`),
      /** Chop etish navbati (eng yangilari birinchi). */
      jobs: (query?: { printer?: number; page?: number }) => client.get<Paginated<PrintJob>>('/print-jobs/', { query }),
    },

    // ---- Xodimlar va davomat (faqat menejer) -----------------------------
    staff: {
      list: () => listAll<User>('/users/'),
      create: (p: StaffInput) => client.post<User>('/users/', p),
      /** Ism, familiya, lavozim yoki parolni o'zgartirish (kassirga parol berilmaydi). */
      update: (id: number, p: Partial<Omit<StaffInput, 'username'>>) => client.patch<User>(`/users/${id}/`, p),
      delete: (id: number) => client.delete(`/users/${id}/`),
      /** Kassir uchun: kod bilan u o'z qurilmasida PIN o'rnatadi. */
      registrationCode: (id: number) => client.post<RegistrationCode>(`/users/${id}/generate-registration-code/`),
      /** Eng yangilari birinchi. `date` = YYYY-MM-DD, `user` = xodim id. */
      attendance: (query?: { date?: string; user?: number; page?: number }) =>
        client.get<Paginated<AttendanceRecord>>('/attendance/', { query }),
    },

    // ---- Smena (kelib-ketish): har bir xodim o'zi uchun; `onShift` kassir/menejer, `summary` menejer ----
    attendance: {
      me: () => client.get<ShiftStatus>('/attendance/me/'),
      /** Koordinatalar restoran radiusi ichida bo'lishi shart (server tekshiradi). */
      checkIn: (p: { latitude: number; longitude: number }) =>
        client.post<AttendanceRecord>('/attendance/check-in/', { latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6) }),
      checkOut: (p: { latitude: number; longitude: number }) =>
        client.post<AttendanceRecord>('/attendance/check-out/', { latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6) }),
      /** Hozir smenada turgan xodimlar. */
      onShift: () => client.get<AttendanceRecord[]>('/attendance/on-shift/'),
      /** `from`/`to` = YYYY-MM-DD; berilmasa oxirgi 7 kun. */
      summary: (query?: { from?: string; to?: string }) => client.get<AttendanceSummary>('/attendance/summary/', { query }),
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
