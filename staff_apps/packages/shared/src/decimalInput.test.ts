import { describe, expect, it } from 'vitest';
import { parseDecimalInput, parseOptionalDecimal, trimDecimal } from './decimalInput';

describe('parseDecimalInput', () => {
  it("vergul va bo'shliqlarni to'g'rilaydi", () => {
    expect(parseDecimalInput('1,5')).toBe('1.5');
    expect(parseDecimalInput('25 000')).toBe('25000');
  });
  it("manfiy, harfli va ortiqcha kasrni rad etadi", () => {
    expect(parseDecimalInput('-1')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('1.234', 2)).toBeNull();
    expect(parseDecimalInput('1.234', 3)).toBe('1.234');
    expect(parseDecimalInput('1.')).toBeNull();
  });
  it("0 ni qabul qiladi (chegirma/minimal qoldiq 0 bo'lishi mumkin)", () => {
    expect(parseDecimalInput('0')).toBe('0');
  });
});

describe('parseOptionalDecimal', () => {
  it("bo'sh bo'lsa fallback", () => {
    expect(parseOptionalDecimal('  ', '0')).toBe('0');
    expect(parseOptionalDecimal('12', '0')).toBe('12');
    expect(parseOptionalDecimal('x', '0')).toBeNull();
  });
});

describe('trimDecimal', () => {
  it('ortiqcha nollarni olib tashlaydi', () => {
    expect(trimDecimal('12.000')).toBe('12');
    expect(trimDecimal('1.500')).toBe('1.5');
    expect(trimDecimal(null)).toBe('0');
  });
});
