import { describe, expect, it } from 'vitest';

import {
  addDays,
  barRatios,
  canShiftForward,
  daysBetween,
  deltaPercent,
  fillHours,
  formatDelta,
  isoDay,
  matchPreset,
  methodShares,
  presetRange,
  previousRange,
  rangeLabel,
  shiftRange, dayEndText, type DayEndReport } from './reports';

const NOW = new Date(2026, 10, 20, 15, 30); // 20 noyabr 2026 (juma)

describe('davr tanlash', () => {
  it('tayyor davrlar', () => {
    expect(presetRange('today', NOW)).toEqual({ from: '2026-11-20', to: '2026-11-20' });
    expect(presetRange('yesterday', NOW)).toEqual({ from: '2026-11-19', to: '2026-11-19' });
    expect(presetRange('week', NOW)).toEqual({ from: '2026-11-14', to: '2026-11-20' });
    expect(presetRange('month', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-20' });
  });

  it("oy va yil chegarasidan o'tadi", () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(presetRange('week', new Date(2027, 0, 3, 10))).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it("kun hisobi: kech tunda ham kun o'zgarmaydi (UTC siljishi yo'q)", () => {
    expect(isoDay(new Date(2026, 10, 20, 23, 59))).toBe('2026-11-20');
    expect(isoDay(new Date(2026, 10, 20, 0, 1))).toBe('2026-11-20');
  });

  it('oldingi davr xuddi shu uzunlikda va darhol oldin', () => {
    const week = presetRange('week', NOW);
    expect(daysBetween(week)).toBe(7);
    expect(previousRange(week)).toEqual({ from: '2026-11-07', to: '2026-11-13' });
    expect(previousRange({ from: '2026-11-20', to: '2026-11-20' })).toEqual({ from: '2026-11-19', to: '2026-11-19' });
  });

  it('matchPreset', () => {
    expect(matchPreset({ from: '2026-11-20', to: '2026-11-20' }, NOW)).toBe('today');
    expect(matchPreset({ from: '2026-11-05', to: '2026-11-08' }, NOW)).toBeNull();
  });

  it('suradi, lekin kelajakka chiqmaydi', () => {
    expect(shiftRange({ from: '2026-11-19', to: '2026-11-19' }, -1, NOW)).toEqual({ from: '2026-11-18', to: '2026-11-18' });
    const today = { from: '2026-11-20', to: '2026-11-20' };
    expect(shiftRange(today, 1, NOW)).toEqual(today);
    expect(canShiftForward(today, NOW)).toBe(false);
    expect(canShiftForward({ from: '2026-11-10', to: '2026-11-19' }, NOW)).toBe(true);
    // Yarmi kelajakka tushsa bugungacha qisqartiriladi.
    expect(shiftRange({ from: '2026-11-10', to: '2026-11-18' }, 1, NOW)).toEqual({ from: '2026-11-19', to: '2026-11-20' });
  });

  it('yorliqlar', () => {
    expect(rangeLabel({ from: '2026-11-20', to: '2026-11-20' })).toBe('Ju, 20 noy');
    expect(rangeLabel({ from: '2026-11-14', to: '2026-11-20' })).toBe('14 noy – 20 noy');
  });
});

describe('taqqoslash', () => {
  it("o'zgarish foizi", () => {
    expect(deltaPercent('120000.00', '100000.00')).toBe(20);
    expect(deltaPercent('90000.00', '100000.00')).toBe(-10);
    expect(deltaPercent('100000.00', '100000.00')).toBe(0);
  });
  it("oldingi 0 bo'lsa solishtirib bo'lmaydi", () => {
    expect(deltaPercent('50000.00', '0.00')).toBeNull();
    expect(deltaPercent(5, 0)).toBeNull();
  });
  it('formatDelta', () => {
    expect(formatDelta(12)).toBe('+12%');
    expect(formatDelta(-5)).toBe('−5%');
    expect(formatDelta(0)).toBe('0%');
    expect(formatDelta(null)).toBe('');
  });
});

describe('grafik yordamchilari', () => {
  it('barRatios eng kattasiga nisbatan', () => {
    expect(barRatios(['50000.00', '25000.00', '0.00'])).toEqual([1, 0.5, 0]);
    expect(barRatios(['0.00', '0.00'])).toEqual([0, 0]);
    expect(barRatios([])).toEqual([]);
  });
  it('methodShares', () => {
    expect(methodShares({ cash: '30000.00', card: '20000.00', other: '0.00' })).toEqual({ cash: 60, card: 40, other: 0 });
    expect(methodShares({ cash: '0.00', card: '0.00', other: '0.00' })).toEqual({ cash: 0, card: 0, other: 0 });
  });
  it("fillHours teshiklarni 0 bilan to'ldiradi va chegaradan chiqqan soatni qamraydi", () => {
    const rows = fillHours([{ hour: '12:00', revenue: '1000.00' }, { hour: '02:00', revenue: '500.00' }], 10, 14);
    expect(rows[0]?.hour).toBe('02:00');
    expect(rows.at(-1)?.hour).toBe('14:00');
    expect(rows.find((r) => r.hour === '13:00')?.revenue).toBe('0.00');
    expect(rows.find((r) => r.hour === '12:00')?.revenue).toBe('1000.00');
  });
});

describe('dayEndText', () => {
  /** Pul bo'luvchisi qattiq bo'shliq - solishtirish uchun oddiyga o'giramiz. */
  const norm = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ');
  const base: DayEndReport = {
    date: '2026-11-20',
    generated_at: '2026-11-20T20:00:00+05:00',
    register: { is_open: true, opened_at: null, closed_at: null },
    revenue: {
      total: '1542000.00',
      by_method: { cash: '739000.00', card: '92000.00', other: '711000.00' },
      payment_count: 14,
      order_count: 12,
      avg_check: '128500.00',
      discount_total: '0.00',
    },
    cash: { sales: '739000.00', debt_repayments: '30000.00', expected: '769000.00' },
    debts: { credit_sales: '0.00', repayments: '30000.00' },
    voids: { cancelled_orders: 0, voided_items: 0, voided_payments: 0, voided_payments_total: '0.00' },
    open_orders: { count: 0, items: [] },
  };

  it('asosiy ko\'rsatkichlarni yozadi, bo\'sh bo\'limlarni tashlab ketadi', () => {
    const t = norm(dayEndText(base));
    expect(t).toContain('Tushum:');
    expect(t).toContain('Kassadagi naqd (kutilgan): 769 000');
    expect(t).toContain('qaytarilgan qarz: 30 000');
    expect(t).not.toContain('Chegirmalar');
    expect(t).not.toContain('Bekor:');
    expect(t).not.toContain('Yopilmagan');
  });

  it('chegirma, bekor va yopilmagan buyurtmalar bo\'lsa ko\'rsatadi', () => {
    const t = norm(dayEndText({
      ...base,
      revenue: { ...base.revenue, discount_total: '5000.00' },
      voids: { cancelled_orders: 1, voided_items: 2, voided_payments: 1, voided_payments_total: '14200.00' },
      open_orders: { count: 3, items: [] },
    }));
    expect(t).toContain('Chegirmalar: 5 000');
    expect(t).toContain('Bekor: 1 buyurtma, 2 taom, 1 to\'lov');
    expect(t).toContain('Yopilmagan buyurtmalar: 3 ta');
  });
});
