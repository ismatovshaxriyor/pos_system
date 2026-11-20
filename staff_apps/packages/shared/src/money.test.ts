import { describe, expect, it } from 'vitest';
import { formatMoney, tiyinToDecimal, toNumber, toTiyin } from './money';

describe('money', () => {
  it('server string summasini tiyinga aylantiradi (floating-point xatosiz)', () => {
    expect(toTiyin('45000.00')).toBe(4_500_000);
    expect(toTiyin('0.10')).toBe(10);
    // 0.1 + 0.2 klassik xatosi: tiyinda butun son bo'lib qoladi
    expect(toTiyin('0.10') + toTiyin('0.20')).toBe(30);
  });

  it('boʼsh va yaroqsiz qiymatlarda 0', () => {
    expect(toTiyin(null)).toBe(0);
    expect(toTiyin(undefined)).toBe(0);
    expect(toTiyin('')).toBe(0);
    expect(toTiyin('abc')).toBe(0);
  });

  it('serverga yuborish uchun 2 xonali string', () => {
    expect(tiyinToDecimal(4_500_000)).toBe('45000.00');
    expect(tiyinToDecimal(5)).toBe('0.05');
  });

  it('ming boʼluvchi bilan formatlaydi', () => {
    expect(formatMoney('45000.00')).toBe('45 000 soʼm');
    expect(formatMoney(1234567, false)).toBe('1 234 567');
    expect(formatMoney('999.00', false)).toBe('999');
    expect(formatMoney('-1500.00', false)).toBe('-1 500');
  });

  it('toNumber', () => {
    expect(toNumber('12.50')).toBe(12.5);
  });
});
