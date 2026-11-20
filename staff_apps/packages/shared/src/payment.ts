import type { PaymentMethod } from './types';

/** Kassir terminalidagi summa kiritish: faqat raqamlar, so'mda (butun). Boshidagi nollar olib tashlanadi. */
export function pushDigit(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) return current;
  const next = (current + digit).replace(/^0+(?=\d)/, '');
  return next.length > 12 ? current : next; // 12 xona - haqiqiy summadan ancha katta, tasodifiy bosishdan himoya
}

export function popDigit(current: string): string {
  return current.slice(0, -1);
}

/** Kiritilgan so'm → tiyin. Bo'sh qator = 0. */
export function enteredTiyin(input: string): number {
  return input === '' ? 0 : Number(input) * 100;
}

export type PaymentPlan =
  | { ok: true; payTiyin: number; changeTiyin: number }
  | { ok: false; reason: string };

/**
 * Kassirning kiritganidan serverga YUBORILADIGAN summani va mijozga QAYTARILADIGAN qaytimni hisoblaydi.
 *  - hech narsa kiritilmagan (`null`) = aniq qolgan summa (karta/QR uchun bir bosishda to'lov);
 *  - naqd: berilgan summa qarzdan ko'p bo'lsa, qarz yoziladi, ortig'i qaytim;
 *  - naqd bo'lmagan usulda ortiqcha summa xato (qaytim berib bo'lmaydi);
 *  - qarzdan kam = qisman to'lov (split-payment).
 * `dueTiyin` serverdan kelgan `balance_due` - klient o'zi qarzni hisoblamaydi.
 */
export function planPayment(args: { method: PaymentMethod; dueTiyin: number; enteredTiyin: number | null }): PaymentPlan {
  const { method, dueTiyin, enteredTiyin: entered } = args;
  if (dueTiyin <= 0) return { ok: false, reason: "To'lanadigan qarz yo'q." };
  if (entered === null) return { ok: true, payTiyin: dueTiyin, changeTiyin: 0 };
  if (entered <= 0) return { ok: false, reason: 'Summani kiriting.' };
  if (entered > dueTiyin) {
    if (method !== 'cash') return { ok: false, reason: "Summa qolgan qarzdan ortiq bo'lmasligi kerak." };
    return { ok: true, payTiyin: dueTiyin, changeTiyin: entered - dueTiyin };
  }
  return { ok: true, payTiyin: entered, changeTiyin: 0 };
}

const NOTE_STEPS_SOM = [10_000, 50_000, 100_000, 200_000];

/**
 * Naqd to'lovda "tez summa" tugmalari: qarzdan katta, eng yaqin yaxlit summalar (tiyinda).
 * Aniq summa alohida tugma, bu ro'yxatga kirmaydi.
 */
export function suggestCashAmounts(dueTiyin: number, max = 3): number[] {
  if (dueTiyin <= 0) return [];
  const out = new Set<number>();
  for (const step of NOTE_STEPS_SOM) {
    const s = step * 100;
    const up = Math.ceil(dueTiyin / s) * s;
    if (up > dueTiyin) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, max);
}
