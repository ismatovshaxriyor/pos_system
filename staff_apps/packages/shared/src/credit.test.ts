import { describe, expect, it } from 'vitest';
import {
  checkDiscount,
  checkRepayment,
  customerName,
  discountFromPercent,
  dueDateFromDays,
  hasDiscount,
  isOverdue,
} from './credit';

describe('dueDateFromDays', () => {
  const now = new Date(2026, 10, 20, 23, 59); // 20-noyabr 2026, kechqurun

  it('null = muddatsiz', () => {
    expect(dueDateFromDays(null, now)).toBeNull();
  });
  it('mahalliy kalendar kuniga kun qoʼshadi', () => {
    expect(dueDateFromDays(0, now)).toBe('2026-11-20');
    expect(dueDateFromDays(7, now)).toBe('2026-11-27');
  });
  it('oy va yil chegarasidan oʼtadi', () => {
    expect(dueDateFromDays(14, now)).toBe('2026-12-04');
    expect(dueDateFromDays(30, new Date(2026, 11, 15))).toBe('2027-01-14');
  });
});

describe('discountFromPercent', () => {
  it('foizni butun soʼmga yaxlitlaydi (tiyinda)', () => {
    expect(discountFromPercent(9_200_000, 10)).toBe(920_000); // 92 000 so'mning 10% = 9 200
    expect(discountFromPercent(12_345_00, 10)).toBe(123_500); // 1 234,5 -> 1 235
  });
  it('0, manfiy va boʼsh jamida 0', () => {
    expect(discountFromPercent(9_200_000, 0)).toBe(0);
    expect(discountFromPercent(9_200_000, -5)).toBe(0);
    expect(discountFromPercent(0, 10)).toBe(0);
  });
  it('100% dan oshmaydi va jamidan katta boʼlmaydi', () => {
    expect(discountFromPercent(9_200_000, 150)).toBe(9_200_000);
  });
});

describe('checkDiscount', () => {
  it('server qoidasini takrorlaydi', () => {
    expect(checkDiscount(0, 100)).toEqual({ ok: true });
    expect(checkDiscount(100, 100)).toEqual({ ok: true });
    expect(checkDiscount(101, 100).ok).toBe(false);
    expect(checkDiscount(-1, 100).ok).toBe(false);
  });
});

describe('yordamchilar', () => {
  it('hasDiscount', () => {
    expect(hasDiscount('0.00')).toBe(false);
    expect(hasDiscount('5000.00')).toBe(true);
  });
  it('customerName familyasiz ham ishlaydi', () => {
    expect(customerName({ first_name: 'Aziz', last_name: '' })).toBe('Aziz');
    expect(customerName({ first_name: 'Aziz', last_name: 'Karimov' })).toBe('Aziz Karimov');
  });
});

describe('checkRepayment / isOverdue', () => {
  it('summani qarz bilan solishtiradi', () => {
    expect(checkRepayment(0, 100).ok).toBe(false);
    expect(checkRepayment(100, 100).ok).toBe(true);
    expect(checkRepayment(101, 100).ok).toBe(false);
  });
  it('muddati o\'tganini aniqlaydi', () => {
    const now = new Date(2026, 10, 20);
    expect(isOverdue(null, now)).toBe(false);
    expect(isOverdue('2026-11-20', now)).toBe(false);
    expect(isOverdue('2026-11-19', now)).toBe(true);
    expect(isOverdue('xato', now)).toBe(false);
  });
});
