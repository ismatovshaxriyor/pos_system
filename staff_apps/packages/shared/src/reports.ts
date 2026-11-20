/**
 * Menejer hisobotlari (`/api/reports/*`): javob turlari + davr tanlash va taqqoslash yordamchilari.
 * Pul qiymatlari server tomondan `"50000.00"` ko'rinishidagi satr (qolgani `money.ts`).
 */
import type { Decimal } from './types';
import { formatMoney, toTiyin } from './money';

export interface PaymentMethodTotals {
  cash: Decimal;
  card: Decimal;
  other: Decimal;
}

export interface DashboardReport {
  date: string;
  revenue: {
    total: Decimal;
    by_method: PaymentMethodTotals;
    order_count: number;
    avg_check: Decimal;
    discount_total: Decimal;
    cancelled_orders: number;
  };
  voids: { voided_items: number; voided_payments: number; voided_payments_total: Decimal };
  floor: { occupied_tables: number; open_orders: number; active_staff: number };
  debts: { total_outstanding: Decimal; debtor_count: number };
  inventory: { low_stock_count: number; total_value: Decimal };
  top_products: { name: string; quantity: number; revenue: Decimal }[];
  hourly_revenue: { hour: string; revenue: Decimal }[];
}

export type SalesGroupBy = 'day' | 'waiter' | 'product' | 'category';

export interface SalesRow {
  key: string;
  revenue: Decimal;
  /** product/category */
  quantity?: number;
  /** day */
  payment_count?: number;
  /** waiter */
  waiter_id?: number | null;
}

export interface SalesReport {
  group_by: SalesGroupBy;
  from: string;
  to: string;
  total_revenue: Decimal;
  by_method: PaymentMethodTotals;
  order_count: number;
  avg_check: Decimal;
  discount_total: Decimal;
  cancelled_orders: number;
  rows: SalesRow[];
}

export interface StaffReport {
  date: string;
  from: string;
  to: string;
  waiters: {
    waiter_id: number | null;
    waiter_name: string;
    revenue: Decimal;
    payment_count: number;
    completed_orders: number;
  }[];
  clocked_in: { user_id: number; name: string; role: string; check_in: string }[];
}

export interface DebtsReport {
  date: string;
  total_outstanding: Decimal;
  debtor_count: number;
  top_debtors: { id: number; name: string; phone: string; balance: Decimal }[];
  credit_sales_today: Decimal;
  repayments_today: Decimal;
}

export interface InventoryReport {
  date: string;
  ingredient_count: number;
  total_value: Decimal;
  low_stock_count: number;
  low_stock: { id: number; name: string; unit: string; current_stock: string; min_stock: string }[];
  consumed_units_today: string;
  purchased_cost_today: Decimal;
}

// ---- Davr tanlash -----------------------------------------------------------

/** `YYYY-MM-DD` (kalendar kuni, vaqt mintaqasisiz). */
export type IsoDay = string;
export interface DateRange {
  from: IsoDay;
  to: IsoDay;
}

export type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month';

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Bugun' },
  { id: 'yesterday', label: 'Kecha' },
  { id: 'week', label: '7 kun' },
  { id: 'month', label: 'Shu oy' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Mahalliy kalendar kuni -> `YYYY-MM-DD` (UTC siljishi bilan adashmaslik uchun `toISOString` ishlatilmaydi). */
export function isoDay(d: Date): IsoDay {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` -> kunning tushki 12:00 (DST/soat siljishida kun o'zgarib ketmasin). */
export function parseDay(day: IsoDay): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

export function addDays(day: IsoDay, n: number): IsoDay {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export function daysBetween(range: DateRange): number {
  return Math.round((parseDay(range.to).getTime() - parseDay(range.from).getTime()) / 86_400_000) + 1;
}

export function presetRange(preset: PeriodPreset, now: Date = new Date()): DateRange {
  const today = isoDay(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** Qaysi tayyor tanlovga to'g'ri kelishi (tugma "tanlangan" bo'lib ko'rinishi uchun); yo'q bo'lsa null. */
export function matchPreset(range: DateRange, now: Date = new Date()): PeriodPreset | null {
  return PERIOD_PRESETS.find((p) => {
    const r = presetRange(p.id, now);
    return r.from === range.from && r.to === range.to;
  })?.id ?? null;
}

/** Davrni o'z uzunligicha oldinga/orqaga suradi (◀ ▶). Kelajakka chiqmaydi. */
export function shiftRange(range: DateRange, direction: 1 | -1, now: Date = new Date()): DateRange {
  const len = daysBetween(range);
  const next = { from: addDays(range.from, direction * len), to: addDays(range.to, direction * len) };
  const today = isoDay(now);
  return next.from > today ? range : next.to > today ? { from: next.from, to: today } : next;
}

export function canShiftForward(range: DateRange, now: Date = new Date()): boolean {
  return range.to < isoDay(now);
}

/** Taqqoslash uchun: shu davrdan darhol oldingi, xuddi shuncha kunlik davr. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range);
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
const WEEKDAYS = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'];

/** '2026-11-20' -> '20 noy'. */
export function dayLabel(day: IsoDay): string {
  const d = parseDay(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** '2026-11-20' -> 'Ju, 20 noy'. */
export function dayLabelWithWeekday(day: IsoDay): string {
  return `${WEEKDAYS[parseDay(day).getDay()]}, ${dayLabel(day)}`;
}

export function rangeLabel(range: DateRange): string {
  return range.from === range.to ? dayLabelWithWeekday(range.from) : `${dayLabel(range.from)} – ${dayLabel(range.to)}`;
}

// ---- Taqqoslash va grafik yordamchilari -------------------------------------

/**
 * O'zgarish foizi (butun songa yaxlitlangan). Oldingi qiymat 0 bo'lsa solishtirib bo'lmaydi -> null
 * (o'zboshimchalik bilan "+100%" yoki "∞" ko'rsatmaslik uchun).
 */
export function deltaPercent(current: Decimal | number, previous: Decimal | number): number | null {
  const cur = typeof current === 'number' ? current : toTiyin(current);
  const prev = typeof previous === 'number' ? previous : toTiyin(previous);
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** `+12%`, `−5%`, `0%`; null -> ''. */
export function formatDelta(delta: number | null): string {
  if (delta === null) return '';
  if (delta > 0) return `+${delta}%`;
  if (delta < 0) return `−${Math.abs(delta)}%`;
  return '0%';
}

/** Ustunli grafik uchun: qiymatlarni 0..1 ga keltiradi (eng kattasi = 1). Hammasi 0 bo'lsa hammasi 0. */
export function barRatios(values: (Decimal | number)[]): number[] {
  const nums = values.map((v) => (typeof v === 'number' ? v : toTiyin(v)));
  const max = Math.max(0, ...nums);
  return nums.map((n) => (max > 0 ? Math.max(n, 0) / max : 0));
}

/** Naqd/karta/boshqa ulushlari (foizda, yig'indisi ~100). Jami 0 bo'lsa hammasi 0. */
export function methodShares(m: PaymentMethodTotals): Record<keyof PaymentMethodTotals, number> {
  const cash = toTiyin(m.cash);
  const card = toTiyin(m.card);
  const other = toTiyin(m.other);
  const total = cash + card + other;
  if (total <= 0) return { cash: 0, card: 0, other: 0 };
  return {
    cash: Math.round((cash / total) * 100),
    card: Math.round((card / total) * 100),
    other: Math.round((other / total) * 100),
  };
}

/** 24 soatlik to'liq qator (tushumsiz soatlar 0) - grafikda teshik bo'lmasligi uchun. */
export function fillHours(rows: { hour: string; revenue: Decimal }[], from = 8, to = 23): { hour: string; revenue: Decimal }[] {
  const byHour = new Map(rows.map((r) => [r.hour, r.revenue]));
  const out: { hour: string; revenue: Decimal }[] = [];
  const first = Math.min(from, ...rows.map((r) => Number(r.hour.slice(0, 2))));
  const last = Math.max(to, ...rows.map((r) => Number(r.hour.slice(0, 2))));
  for (let h = first; h <= last; h++) {
    const key = `${pad(h)}:00`;
    out.push({ hour: key, revenue: byHour.get(key) ?? '0.00' });
  }
  return out;
}

/** Kassir uchun kun yakuni (`GET /api/reports/day-end/`): faqat bugun. */
export interface DayEndReport {
  date: string;
  generated_at: string;
  register: { is_open: boolean; opened_at: string | null; closed_at: string | null };
  revenue: {
    total: Decimal;
    by_method: PaymentMethodTotals;
    payment_count: number;
    order_count: number;
    avg_check: Decimal;
    discount_total: Decimal;
  };
  /** `expected` = bugungi naqd tushum + bugun naqd qaytarilgan qarzlar: kassa tortmasida bo'lishi kerak. */
  cash: { sales: Decimal; debt_repayments: Decimal; expected: Decimal };
  debts: { credit_sales: Decimal; repayments: Decimal };
  voids: { cancelled_orders: number; voided_items: number; voided_payments: number; voided_payments_total: Decimal };
  open_orders: {
    count: number;
    items: { id: number; table: string | null; waiter: string | null; total: Decimal; created_at: string }[];
  };
}

/** Kun yakuni hisobotining matni (xabar sifatida yuborish/nusxalash uchun). */
export function dayEndText(r: DayEndReport): string {
  const lines = [
    `Kun yakuni · ${dayLabelWithWeekday(r.date)}`,
    '',
    `Tushum: ${formatMoney(r.revenue.total)}`,
    `  Naqd: ${formatMoney(r.revenue.by_method.cash)}`,
    `  Karta: ${formatMoney(r.revenue.by_method.card)}`,
    `  Boshqa: ${formatMoney(r.revenue.by_method.other)}`,
    `Buyurtmalar: ${r.revenue.order_count} ta · o'rtacha chek ${formatMoney(r.revenue.avg_check)}`,
  ];
  if (toTiyin(r.revenue.discount_total) > 0) lines.push(`Chegirmalar: ${formatMoney(r.revenue.discount_total)}`);
  lines.push('', `Kassadagi naqd (kutilgan): ${formatMoney(r.cash.expected)}`);
  if (toTiyin(r.cash.debt_repayments) > 0) lines.push(`  shundan qaytarilgan qarz: ${formatMoney(r.cash.debt_repayments)}`);
  if (toTiyin(r.debts.credit_sales) > 0 || toTiyin(r.debts.repayments) > 0) {
    lines.push(`Nasiyaga: ${formatMoney(r.debts.credit_sales)} · qaytarildi: ${formatMoney(r.debts.repayments)}`);
  }
  const v = r.voids;
  if (v.cancelled_orders || v.voided_items || v.voided_payments) {
    lines.push(`Bekor: ${v.cancelled_orders} buyurtma, ${v.voided_items} taom, ${v.voided_payments} to'lov (${formatMoney(v.voided_payments_total)})`);
  }
  if (r.open_orders.count > 0) lines.push(`Yopilmagan buyurtmalar: ${r.open_orders.count} ta`);
  return lines.join('\n');
}
