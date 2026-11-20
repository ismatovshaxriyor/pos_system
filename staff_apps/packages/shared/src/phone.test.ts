import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';

describe('phone', () => {
  it.each([
    ['90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['+998 (90) 123-45-67', '+998901234567'],
    ['+998901234567', '+998901234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('yaroqsiz raqamga null', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('+1 555 123 4567')).toBeNull();
  });

  it('terish paytida formatlaydi', () => {
    expect(formatPhone('')).toBe('+998');
    expect(formatPhone('901')).toBe('+998 90 1');
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone('9012345678999')).toBe('+998 90 123 45 67'); // ortiqcha raqamlar kesiladi
  });
});
