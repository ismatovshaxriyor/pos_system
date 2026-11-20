import { toTiyin } from './money';
import type { Decimal } from './types';

/** Qarz muddati tez tanlovlari (kun). `null` = muddatsiz. */
export const DUE_DAY_OPTIONS: readonly (number | null)[] = [null, 7, 14, 30];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `now` dan `days` kun keyingi sana, `YYYY-MM-DD` (server `DateField` formati).
 * Qurilmaning MAHALLIY sanasi ishlatiladi: restoranda "bugundan 7 kun" kassir ko'rgan kalendar kuni.
 */
export function dueDateFromDays(days: number | null, now: Date = new Date()): string | null {
  if (days === null) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Chegirma foizi → tiyin (butun so'mga yaxlitlanadi: kassirga "12 345,67" emas, "12 346"). */
export function discountFromPercent(totalTiyin: number, percent: number): number {
  if (!(percent > 0) || totalTiyin <= 0) return 0;
  const raw = (totalTiyin * Math.min(percent, 100)) / 100;
  return Math.min(totalTiyin, Math.round(raw / 100) * 100);
}

export type DiscountCheck = { ok: true } | { ok: false; reason: string };

/** Server qoidasi: chegirma 0 dan kam yoki mahsulotlar jamidan ko'p bo'lishi mumkin emas. */
export function checkDiscount(discountTiyin: number, totalTiyin: number): DiscountCheck {
  if (discountTiyin < 0) return { ok: false, reason: "Chegirma manfiy bo'lishi mumkin emas" };
  if (discountTiyin > totalTiyin) return { ok: false, reason: 'Chegirma mahsulotlar summasidan katta boʼlishi mumkin emas' };
  return { ok: true };
}

/** Chegirma hozir qo'yilganmi (chegirmani "olib tashlash" tugmasi uchun). */
export function hasDiscount(discountAmount: Decimal): boolean {
  return toTiyin(discountAmount) > 0;
}

/** Mijozni qidirish natijasi uchun: "Ism Familya". */
export function customerName(c: { first_name: string; last_name: string }): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ');
}

/** Server qoidasi: qaytarilayotgan summa 0 dan katta va mijoz joriy qarzidan oshmasligi kerak. */
export function checkRepayment(amountTiyin: number, balanceTiyin: number): DiscountCheck {
  if (!(amountTiyin > 0)) return { ok: false, reason: 'Summani kiriting' };
  if (amountTiyin > balanceTiyin) return { ok: false, reason: 'Summa mijoz qarzidan katta boʼlishi mumkin emas' };
  return { ok: true };
}

/** Qarz muddati o'tganmi (`due_date` = `YYYY-MM-DD`, mahalliy sana bilan solishtiriladi; bugun hali o'tmagan). */
export function isOverdue(dueDate: string | null, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!m) return false;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < today.getTime();
}
