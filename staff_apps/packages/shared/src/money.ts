import type { Decimal } from './types';

/**
 * Backend summani "45000.00" string sifatida beradi. So'm uchun tiyin hisobi
 * yuritilmaydi, lekin serverda 2 xona saqlanadi - butun so'mga yaxlitlab
 * ko'rsatamiz, hisob-kitobni esa har doim tiyinda (butun son) bajaramiz,
 * shunda floating-point xatolari yig'ilmaydi.
 */
export function toTiyin(value: Decimal | number | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toNumber(value: Decimal | number | null | undefined): number {
  return toTiyin(value) / 100;
}

/** Serverga yuborish uchun: tiyindan "45000.00" ko'rinishiga. */
export function tiyinToDecimal(tiyin: number): Decimal {
  return (Math.round(tiyin) / 100).toFixed(2);
}

/** `45000` → `45 000`. Bo'luvchi sifatida qattiq bo'shliq (satr uzilib qolmasin). */
export function formatMoney(value: Decimal | number | null | undefined, withCurrency = true): string {
  const rounded = Math.round(toNumber(value));
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return withCurrency ? `${sign}${digits} soʼm` : `${sign}${digits}`;
}
