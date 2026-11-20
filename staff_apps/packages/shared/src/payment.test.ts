import { describe, expect, it } from 'vitest';
import { enteredTiyin, planPayment, popDigit, pushDigit, suggestCashAmounts } from './payment';

describe('keypad', () => {
  it('boshidagi nollarni olib tashlaydi va 12 xonadan oshirmaydi', () => {
    expect(pushDigit('', '0')).toBe('0');
    expect(pushDigit('0', '5')).toBe('5');
    expect(pushDigit('12', '3')).toBe('123');
    expect(pushDigit('123456789012', '1')).toBe('123456789012');
    expect(pushDigit('1', 'x')).toBe('1');
  });
  it('popDigit va enteredTiyin', () => {
    expect(popDigit('123')).toBe('12');
    expect(popDigit('')).toBe('');
    expect(enteredTiyin('')).toBe(0);
    expect(enteredTiyin('45000')).toBe(4_500_000);
  });
});

describe('planPayment', () => {
  const due = 9_200_050; // 92 000.50
  it('boʼsh kiritish = aniq qolgan summa (tiyin bilan)', () => {
    expect(planPayment({ method: 'card', dueTiyin: due, enteredTiyin: null })).toEqual({ ok: true, payTiyin: due, changeTiyin: 0 });
  });
  it('naqdda ortiqcha berilsa qarz yoziladi, ortigʼi qaytim', () => {
    expect(planPayment({ method: 'cash', dueTiyin: 5_100_000, enteredTiyin: 10_000_000 })).toEqual({
      ok: true,
      payTiyin: 5_100_000,
      changeTiyin: 4_900_000,
    });
  });
  it('karta/boshqada ortiqcha summa rad etiladi', () => {
    expect(planPayment({ method: 'card', dueTiyin: 5_100_000, enteredTiyin: 10_000_000 }).ok).toBe(false);
    expect(planPayment({ method: 'other', dueTiyin: 5_100_000, enteredTiyin: 5_100_001 }).ok).toBe(false);
  });
  it('qarzdan kam = qisman toʼlov, qaytim yoʼq', () => {
    expect(planPayment({ method: 'cash', dueTiyin: 5_100_000, enteredTiyin: 2_000_000 })).toEqual({ ok: true, payTiyin: 2_000_000, changeTiyin: 0 });
  });
  it('0 kiritilsa va qarz yoʼq boʼlsa rad etiladi (tasodifan "0" bosilsa toʼliq toʼlanib ketmasin)', () => {
    expect(planPayment({ method: 'cash', dueTiyin: 5_100_000, enteredTiyin: 0 }).ok).toBe(false);
    expect(planPayment({ method: 'cash', dueTiyin: 0, enteredTiyin: null }).ok).toBe(false);
  });
});

describe('suggestCashAmounts', () => {
  it('qarzdan katta eng yaqin yaxlit summalar, takrorsiz va oʼsish tartibida', () => {
    // 51 000 so'm -> 60 000, 100 000, 200 000 (50 000 dan katta bo'lgani uchun 100 000 va 200 000 dublikat emas)
    expect(suggestCashAmounts(5_100_000)).toEqual([6_000_000, 10_000_000, 20_000_000]);
  });
  it('qarz yaxlit boʼlsa oʼzidan katta keyingilarni beradi', () => {
    expect(suggestCashAmounts(10_000_000)).toEqual([20_000_000]); // 100 000 qarz: o'zidan katta yaxlit summa faqat 200 000
  });
  it('qarz yoʼq boʼlsa boʼsh', () => {
    expect(suggestCashAmounts(0)).toEqual([]);
  });
});
