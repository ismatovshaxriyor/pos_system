/**
 * Hisobotlarni Excel varaqlariga aylantirish (toza funksiyalar: ekrandagi ma'lumotning o'zi, qo'shimcha so'rovsiz).
 * Pul qiymatlari server tomondan satr (`"50000.00"`) - Excel'da hisoblash mumkin bo'lishi uchun son qilib yoziladi.
 */
import type { Cell, XlsxSheet } from './xlsx';
import type { DashboardReport, DateRange, DebtsReport, InventoryReport, SalesReport, StaffReport } from './reports';
import { rangeLabel } from './reports';

export interface Workbook {
  /** Fayl nomi (kengaytmasiz emas: `.xlsx` bilan). */
  filename: string;
  sheets: XlsxSheet[];
}

const ROLE_LABEL: Record<string, string> = { manager: 'Menejer', waiter: 'Ofitsiant', cashier: 'Kassir' };

/** `"50000.00"` / `"2.500"` -> son. Yaroqsiz qiymat -> 0 (Excel'da `NaN` bo'lmasin). */
export function num(v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const money = (v: string | number | null | undefined): Cell => ({ v: num(v), s: 'money' });
const int = (v: number | null | undefined): Cell => ({ v: v ?? 0, s: 'int' });
const head = (...labels: string[]): Cell[] => labels.map((l) => ({ v: l, s: 'header' as const }));
const bold = (v: string): Cell => ({ v, s: 'bold' });
const title = (v: string): Cell => ({ v, s: 'title' });

/** Fayl nomida bo'lmasligi kerak belgilar yo'q: faqat harf/raqam/`-_`. */
function slug(s: string): string {
  return s.replace(/[^0-9A-Za-z_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function periodSlug(range: DateRange): string {
  return range.from === range.to ? range.from : `${range.from}_${range.to}`;
}

/** "Ko'rsatkich | Qiymat | Oldingi" jadvali uchun bir qator. `prev` bo'lmasa oxirgi ustun bo'sh. */
function kv(label: string, value: Cell, prev?: Cell): Cell[] {
  return prev === undefined ? [label, value] : [label, value, prev];
}

// ---- Panel (bir kun) -------------------------------------------------------------

export function dashboardWorkbook(d: DashboardReport, prev: DashboardReport | null = null): Workbook {
  const r = d.revenue;
  const p = prev?.revenue;
  const cmp = prev !== null;
  const rows: Cell[][] = [
    [title(`Kunlik hisobot — ${d.date}`)],
    [],
    cmp ? head("Ko'rsatkich", 'Qiymat', `Oldingi kun (${prev.date})`) : head("Ko'rsatkich", 'Qiymat'),
    kv('Tushum', money(r.total), cmp ? money(p!.total) : undefined),
    kv('  Naqd', money(r.by_method.cash), cmp ? money(p!.by_method.cash) : undefined),
    kv('  Karta', money(r.by_method.card), cmp ? money(p!.by_method.card) : undefined),
    kv('  Boshqa', money(r.by_method.other), cmp ? money(p!.by_method.other) : undefined),
    kv('Buyurtmalar soni', int(r.order_count), cmp ? int(p!.order_count) : undefined),
    kv("O'rtacha chek", money(r.avg_check), cmp ? money(p!.avg_check) : undefined),
    kv('Chegirmalar', money(r.discount_total), cmp ? money(p!.discount_total) : undefined),
    kv('Bekor qilingan buyurtmalar', int(r.cancelled_orders), cmp ? int(p!.cancelled_orders) : undefined),
    kv('Bekor qilingan taomlar', int(d.voids.voided_items)),
    kv("Bekor qilingan to'lovlar (soni)", int(d.voids.voided_payments)),
    kv("Bekor qilingan to'lovlar (summa)", money(d.voids.voided_payments_total)),
    [],
    [bold('Zal (hozirgi holat)')],
    kv('Band stollar', int(d.floor.occupied_tables)),
    kv('Ochiq buyurtmalar', int(d.floor.open_orders)),
    kv('Hozir ishda (xodim)', int(d.floor.active_staff)),
    [],
    [bold('Qarz va ombor (hozirgi holat)')],
    kv('Jami qarzdorlik', money(d.debts.total_outstanding)),
    kv('Qarzdorlar soni', int(d.debts.debtor_count)),
    kv('Ombor qiymati', money(d.inventory.total_value)),
    kv('Kam qolgan xom-ashyo', int(d.inventory.low_stock_count)),
  ];

  const hourly: Cell[][] = [head('Soat', 'Tushum'), ...d.hourly_revenue.map((h) => [h.hour, money(h.revenue)])];
  const top: Cell[][] = [
    head('№', 'Taom', 'Miqdor', 'Tushum'),
    ...d.top_products.map((t, i) => [int(i + 1), t.name, int(t.quantity), money(t.revenue)]),
  ];

  return {
    filename: `hisobot-panel-${d.date}.xlsx`,
    sheets: [
      { name: 'Xulosa', widths: cmp ? [34, 18, 24] : [34, 18], rows },
      { name: 'Soatlik', widths: [12, 18], freezeRows: 1, rows: hourly },
      { name: 'Top taomlar', widths: [6, 36, 12, 18], freezeRows: 1, rows: top },
    ],
  };
}

// ---- Sotuv (davr) ------------------------------------------------------------------

export interface SalesBundle {
  day: SalesReport;
  waiter: SalesReport;
  product: SalesReport;
  category: SalesReport;
}

/** `prev` - oldingi davrning (kesimsiz) xulosasi; yo'q bo'lsa taqqoslash ustuni chiqmaydi. */
export function salesWorkbook(range: DateRange, s: SalesBundle, prev: SalesReport | null = null): Workbook {
  const t = s.day; // xulosa raqamlari hamma kesimda bir xil
  const cmp = prev !== null;
  const summary: Cell[][] = [
    [title(`Sotuv hisoboti — ${rangeLabel(range)}`)],
    [],
    cmp ? head("Ko'rsatkich", 'Qiymat', 'Oldingi davr') : head("Ko'rsatkich", 'Qiymat'),
    kv('Tushum', money(t.total_revenue), cmp ? money(prev.total_revenue) : undefined),
    kv('  Naqd', money(t.by_method.cash), cmp ? money(prev.by_method.cash) : undefined),
    kv('  Karta', money(t.by_method.card), cmp ? money(prev.by_method.card) : undefined),
    kv('  Boshqa', money(t.by_method.other), cmp ? money(prev.by_method.other) : undefined),
    kv('Buyurtmalar soni', int(t.order_count), cmp ? int(prev.order_count) : undefined),
    kv("O'rtacha chek", money(t.avg_check), cmp ? money(prev.avg_check) : undefined),
    kv('Chegirmalar', money(t.discount_total), cmp ? money(prev.discount_total) : undefined),
    kv('Bekor qilingan buyurtmalar', int(t.cancelled_orders), cmp ? int(prev.cancelled_orders) : undefined),
  ];

  const sumRevenue = (rep: SalesReport) => rep.rows.reduce((a, r) => a + num(r.revenue), 0);
  const total = (label: string, rep: SalesReport, extra: Cell[] = []): Cell[] => [
    { v: label, s: 'bold' },
    ...extra,
    { v: sumRevenue(rep), s: 'moneyBold' },
  ];

  const days: Cell[][] = [
    head('Sana', "To'lovlar soni", 'Tushum'),
    ...s.day.rows.map((r) => [r.key, int(r.payment_count), money(r.revenue)]),
    total('Jami', s.day, [{ v: s.day.rows.reduce((a, r) => a + (r.payment_count ?? 0), 0), s: 'bold' }]),
  ];
  const waiters: Cell[][] = [
    head('Ofitsiant', 'Tushum'),
    ...s.waiter.rows.map((r) => [r.key, money(r.revenue)]),
    total('Jami', s.waiter),
  ];
  const itemRows = (rep: SalesReport, label: string): Cell[][] => [
    head(label, 'Miqdor', 'Tushum'),
    ...rep.rows.map((r) => [r.key, int(r.quantity), money(r.revenue)]),
    total('Jami', rep, [{ v: rep.rows.reduce((a, r) => a + (r.quantity ?? 0), 0), s: 'bold' }]),
  ];

  return {
    filename: `hisobot-sotuv-${periodSlug(range)}.xlsx`,
    sheets: [
      { name: 'Xulosa', widths: cmp ? [34, 18, 18] : [34, 18], rows: summary },
      { name: 'Kunlar', widths: [14, 16, 18], freezeRows: 1, rows: days },
      { name: 'Ofitsiantlar', widths: [30, 18], freezeRows: 1, rows: waiters },
      { name: 'Taomlar', widths: [36, 12, 18], freezeRows: 1, rows: itemRows(s.product, 'Taom') },
      { name: 'Toifalar', widths: [30, 12, 18], freezeRows: 1, rows: itemRows(s.category, 'Toifa') },
    ],
  };
}

// ---- Xodim (davr) ------------------------------------------------------------------

/** ISO vaqtni qurilmaning mahalliy vaqtida `YYYY-MM-DD HH:MM` qilib yozadi. */
export function localDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function staffWorkbook(range: DateRange, r: StaffReport): Workbook {
  const waiters: Cell[][] = [
    head('Ofitsiant', 'Yopilgan buyurtmalar', "To'lovlar soni", 'Tushum', "O'rtacha chek"),
    ...r.waiters.map((w) => [
      w.waiter_name || "Noma'lum",
      int(w.completed_orders),
      int(w.payment_count),
      money(w.revenue),
      money(w.completed_orders > 0 ? num(w.revenue) / w.completed_orders : 0),
    ]),
    [
      bold('Jami'),
      { v: r.waiters.reduce((a, w) => a + w.completed_orders, 0), s: 'bold' },
      { v: r.waiters.reduce((a, w) => a + w.payment_count, 0), s: 'bold' },
      { v: r.waiters.reduce((a, w) => a + num(w.revenue), 0), s: 'moneyBold' },
    ],
  ];
  const clocked: Cell[][] = [
    head('Xodim', 'Lavozim', 'Kelgan vaqt'),
    ...r.clocked_in.map((c) => [c.name || '—', ROLE_LABEL[c.role] ?? c.role, localDateTime(c.check_in)]),
  ];
  return {
    filename: `hisobot-xodim-${periodSlug(range)}.xlsx`,
    sheets: [
      { name: 'Ofitsiantlar', widths: [30, 20, 16, 18, 18], freezeRows: 1, rows: waiters },
      { name: 'Hozir ishda', widths: [30, 16, 20], freezeRows: 1, rows: clocked },
    ],
  };
}

// ---- Qarz va ombor (hozirgi holat) -----------------------------------------------------

export function financeWorkbook(debts: DebtsReport | null, inv: InventoryReport | null, today: string): Workbook {
  const sheets: XlsxSheet[] = [];
  if (debts) {
    sheets.push({
      name: 'Qarzdorlar',
      widths: [32, 20, 18],
      freezeRows: 6,
      rows: [
        [title(`Qarzdorlik — ${debts.date}`)],
        kv('Jami qarzdorlik', money(debts.total_outstanding)),
        kv('Qarzdorlar soni', int(debts.debtor_count)),
        kv('Bugun nasiyaga', money(debts.credit_sales_today)),
        kv('Bugun qaytarildi', money(debts.repayments_today)),
        head('Mijoz', 'Telefon', 'Qarz'),
        ...debts.top_debtors.map((c) => [c.name || `#${c.id}`, c.phone || '', money(c.balance)]),
      ],
    });
  }
  if (inv) {
    sheets.push({
      name: 'Ombor',
      widths: [32, 12, 18, 18],
      freezeRows: 6,
      rows: [
        [title(`Ombor — ${inv.date}`)],
        kv('Ombor qiymati', money(inv.total_value)),
        kv('Xom-ashyo turlari', int(inv.ingredient_count)),
        kv('Bugungi xarid', money(inv.purchased_cost_today)),
        kv('Bugungi sarf (birlik)', { v: num(inv.consumed_units_today), s: undefined }),
        head('Kam qolgan xom-ashyo', 'Birlik', 'Hozirgi qoldiq', 'Minimal qoldiq'),
        ...inv.low_stock.map((i) => [i.name, i.unit, num(i.current_stock), num(i.min_stock)]),
      ],
    });
  }
  return { filename: `hisobot-qarz-ombor-${slug(today)}.xlsx`, sheets };
}
