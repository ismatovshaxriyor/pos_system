import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { DashboardReport, DebtsReport, InventoryReport, SalesReport, StaffReport } from './reports';
import { dashboardWorkbook, financeWorkbook, localDateTime, num, salesWorkbook, staffWorkbook } from './reportsExcel';
import { buildXlsx } from './xlsx';

const M = { cash: '100000.00', card: '50000.00', other: '0.00' };
const dash = (date: string, total: string): DashboardReport => ({
  date,
  revenue: { total, by_method: M, order_count: 7, avg_check: '21428.57', discount_total: '5000.00', cancelled_orders: 1 },
  voids: { voided_items: 2, voided_payments: 1, voided_payments_total: '15000.00' },
  floor: { occupied_tables: 3, open_orders: 4, active_staff: 5 },
  debts: { total_outstanding: '250000.00', debtor_count: 2 },
  inventory: { low_stock_count: 1, total_value: '1200000.00' },
  top_products: [{ name: 'Osh', quantity: 12, revenue: '300000.00' }],
  hourly_revenue: [{ hour: '12:00', revenue: '80000.00' }, { hour: '13:00', revenue: '70000.00' }],
});

const sales = (group: SalesReport['group_by'], rows: SalesReport['rows']): SalesReport => ({
  group_by: group, from: '2026-11-15', to: '2026-11-21', total_revenue: '150000.00', by_method: M,
  order_count: 7, avg_check: '21428.57', discount_total: '5000.00', cancelled_orders: 1, rows,
});

const staff: StaffReport = {
  date: '2026-11-21', from: '2026-11-15', to: '2026-11-21',
  waiters: [
    { waiter_id: 3, waiter_name: 'Ofitsiant', revenue: '90000.00', payment_count: 4, completed_orders: 3 },
    { waiter_id: null, waiter_name: '', revenue: '60000.00', payment_count: 2, completed_orders: 0 },
  ],
  clocked_in: [{ user_id: 3, name: 'Ofitsiant', role: 'waiter', check_in: '2026-11-21T04:00:00Z' }],
};

const debts: DebtsReport = {
  date: '2026-11-21', total_outstanding: '250000.00', debtor_count: 2,
  top_debtors: [{ id: 1, name: 'Ali', phone: '+998901112233', balance: '200000.00' }, { id: 2, name: '', phone: '', balance: '50000.00' }],
  credit_sales_today: '30000.00', repayments_today: '10000.00',
};
const inv: InventoryReport = {
  date: '2026-11-21', ingredient_count: 10, total_value: '1200000.00', low_stock_count: 1,
  low_stock: [{ id: 1, name: 'Guruch', unit: 'kg', current_stock: '2.500', min_stock: '5.000' }],
  consumed_units_today: '3.250', purchased_cost_today: '90000.00',
};

describe('num', () => {
  it('satr/son/yaroqsiz', () => {
    expect([num('50000.00'), num(3), num('x'), num(null), num(undefined), num('2.500')]).toEqual([50000, 3, 0, 0, 0, 2.5]);
  });
});

describe('Excel hisobotlar', () => {
  it('panel: oldingi kun bilan 3 ustun, soatlik va top taomlar varaqlari', () => {
    const wb = dashboardWorkbook(dash('2026-11-21', '150000.00'), dash('2026-11-20', '120000.00'));
    expect(wb.filename).toBe('hisobot-panel-2026-11-21.xlsx');
    expect(wb.sheets.map((s) => s.name)).toEqual(['Xulosa', 'Soatlik', 'Top taomlar']);
    const rows = wb.sheets[0]!.rows;
    expect(rows[2]).toEqual([{ v: "Ko'rsatkich", s: 'header' }, { v: 'Qiymat', s: 'header' }, { v: 'Oldingi kun (2026-11-20)', s: 'header' }]);
    expect(rows[3]).toEqual(['Tushum', { v: 150000, s: 'money' }, { v: 120000, s: 'money' }]);
    expect(wb.sheets[1]!.rows[1]).toEqual(['12:00', { v: 80000, s: 'money' }]);
    expect(wb.sheets[2]!.rows[1]).toEqual([{ v: 1, s: 'int' }, 'Osh', { v: 12, s: 'int' }, { v: 300000, s: 'money' }]);
  });

  it('panel: oldingi kun yo\'q bo\'lsa 2 ustun', () => {
    const rows = dashboardWorkbook(dash('2026-11-21', '150000.00')).sheets[0]!.rows;
    expect(rows[2]).toHaveLength(2);
    expect(rows[3]).toHaveLength(2);
  });

  it('sotuv: 5 varaq, jami qatorlar kesim yig\'indisiga teng', () => {
    const range = { from: '2026-11-15', to: '2026-11-21' };
    const wb = salesWorkbook(
      range,
      {
        day: sales('day', [{ key: '2026-11-20', revenue: '60000.00', payment_count: 2 }, { key: '2026-11-21', revenue: '90000.00', payment_count: 3 }]),
        waiter: sales('waiter', [{ key: 'Ofitsiant', revenue: '150000.00' }]),
        product: sales('product', [{ key: 'Osh', revenue: '100000.00', quantity: 5 }, { key: 'Choy', revenue: '50000.00', quantity: 10 }]),
        category: sales('category', [{ key: 'Taomlar', revenue: '150000.00', quantity: 15 }]),
      },
      sales('day', []),
    );
    expect(wb.filename).toBe('hisobot-sotuv-2026-11-15_2026-11-21.xlsx');
    expect(wb.sheets.map((s) => s.name)).toEqual(['Xulosa', 'Kunlar', 'Ofitsiantlar', 'Taomlar', 'Toifalar']);
    expect(wb.sheets[1]!.rows.at(-1)).toEqual([{ v: 'Jami', s: 'bold' }, { v: 5, s: 'bold' }, { v: 150000, s: 'moneyBold' }]);
    expect(wb.sheets[3]!.rows.at(-1)).toEqual([{ v: 'Jami', s: 'bold' }, { v: 15, s: 'bold' }, { v: 150000, s: 'moneyBold' }]);
  });

  it('sotuv: bitta kun bo\'lsa fayl nomida bitta sana', () => {
    const one = sales('day', []);
    const wb = salesWorkbook({ from: '2026-11-21', to: '2026-11-21' }, { day: one, waiter: one, product: one, category: one });
    expect(wb.filename).toBe('hisobot-sotuv-2026-11-21.xlsx');
  });

  it('xodim: o\'rtacha chek 0 buyurtmada 0 (bo\'linish xatosi yo\'q), jami qator', () => {
    const wb = staffWorkbook({ from: '2026-11-15', to: '2026-11-21' }, staff);
    const rows = wb.sheets[0]!.rows;
    expect(rows[1]![4]).toEqual({ v: 30000, s: 'money' });
    expect(rows[2]![0]).toBe("Noma'lum");
    expect(rows[2]![4]).toEqual({ v: 0, s: 'money' });
    expect(rows.at(-1)![3]).toEqual({ v: 150000, s: 'moneyBold' });
    expect(wb.sheets[1]!.rows[1]![1]).toBe('Ofitsiant');
  });

  it('qarz+ombor: nomsiz mijoz #id, qoldiq son sifatida; faqat mavjud qism chiqadi', () => {
    const wb = financeWorkbook(debts, inv, '2026-11-21');
    expect(wb.filename).toBe('hisobot-qarz-ombor-2026-11-21.xlsx');
    expect(wb.sheets.map((s) => s.name)).toEqual(['Qarzdorlar', 'Ombor']);
    expect(wb.sheets[0]!.rows.at(-1)![0]).toBe('#2');
    expect(wb.sheets[1]!.rows.at(-1)).toEqual(['Guruch', 'kg', 2.5, 5]);
    expect(financeWorkbook(debts, null, '2026-11-21').sheets).toHaveLength(1);
  });

  it('localDateTime yaroqsiz qiymatni o\'zini qaytaradi', () => {
    expect(localDateTime('nodate')).toBe('nodate');
    expect(localDateTime('2026-11-21T04:00:00Z')).toMatch(/^2026-11-2\d \d\d:\d\d$/);
  });

  it('hammasi .xlsx ga yig\'iladi; XLSX_DIR berilsa fayllarni yozadi (tashqi tekshiruv)', () => {
    const range = { from: '2026-11-15', to: '2026-11-21' };
    const one = sales('day', [{ key: '2026-11-21', revenue: '150000.00', payment_count: 3 }]);
    const books = [
      dashboardWorkbook(dash('2026-11-21', '150000.00'), dash('2026-11-20', '120000.00')),
      salesWorkbook(range, { day: one, waiter: one, product: one, category: one }, one),
      staffWorkbook(range, staff),
      financeWorkbook(debts, inv, '2026-11-21'),
    ];
    for (const b of books) {
      const bytes = buildXlsx(b.sheets);
      expect(bytes.length).toBeGreaterThan(500);
      if (process.env.XLSX_DIR) writeFileSync(`${process.env.XLSX_DIR}/${b.filename}`, bytes);
    }
  });
});
