import { describe, expect, it } from 'vitest';

import { extractLicenseKey, formatLicenseKey, isCompleteLicenseKey } from './licenseKey';

describe('formatLicenseKey', () => {
  it('kichik harf va chiziqsiz kiritilganini formatlaydi', () => {
    expect(formatLicenseKey('4d3hbak67ddr')).toBe('4D3H-BAK6-7DDR');
  });
  it('yozish jarayonida qisman kiritilganini ham chiziqlaydi', () => {
    expect(formatLicenseKey('4d3')).toBe('4D3');
    expect(formatLicenseKey('4d3hb')).toBe('4D3H-B');
    expect(formatLicenseKey('4D3H-BAK')).toBe('4D3H-BAK');
  });
  it("bo'sh joy va ortiqcha belgilarni olib tashlaydi", () => {
    expect(formatLicenseKey(' 4D3H BAK6  7DDR ')).toBe('4D3H-BAK6-7DDR');
  });
  it('eski uzun kalitni (40 belgi) buzmaydi', () => {
    const old = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
    expect(formatLicenseKey(old)).toBe(old);
  });
  it("to'liqlikni tekshiradi", () => {
    expect(isCompleteLicenseKey('4D3H-BAK6-7DDR')).toBe(true);
    expect(isCompleteLicenseKey('4D3H-BAK6')).toBe(false);
  });
});

describe('extractLicenseKey', () => {
  it('toza kalitni qaytaradi (katta harfda)', () => {
    expect(extractLicenseKey('4D3H-BAK6-7DDR')).toBe('4D3H-BAK6-7DDR');
    expect(extractLicenseKey(' 4d3h-bak6-7ddr \n')).toBe('4D3H-BAK6-7DDR');
  });
  it("matn/havola ichidagi kalitni topadi", () => {
    expect(extractLicenseKey('Litsenziya: 4D3H-BAK6-7DDR (HamrohPOS)')).toBe('4D3H-BAK6-7DDR');
    expect(extractLicenseKey('https://x.uz/activate?key=4D3H-BAK6-7DDR')).toBe('4D3H-BAK6-7DDR');
  });
  it('chiziqsiz 12 belgini formatlaydi', () => {
    expect(extractLicenseKey('4d3hbak67ddr')).toBe('4D3H-BAK6-7DDR');
  });
  it('eski 40 belgili hex kalitni qabul qiladi', () => {
    const old = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
    expect(extractLicenseKey(old)).toBe(old);
  });
  it('kalitga o\'xshamagan QR - null', () => {
    expect(extractLicenseKey('')).toBeNull();
    expect(extractLicenseKey('https://example.com')).toBeNull();
    expect(extractLicenseKey('12345')).toBeNull();
    expect(extractLicenseKey('AAAA-BBBB-CCCCD')).toBeNull();
  });
});
