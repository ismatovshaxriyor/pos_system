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
  shiftRange,
} from './reports';

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
