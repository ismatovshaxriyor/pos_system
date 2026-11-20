import { describe, expect, it } from 'vitest';
import {
  CASHIER_LAYOUTS,
  HAND_LAYOUTS,
  cashierMirrorsActions,
  handRules,
  isCashierLayout,
  isHandLayout,
} from './layout';

describe('layout', () => {
  it('kassir: har tartibda uchala panel bor va takrorlanmaydi', () => {
    for (const l of CASHIER_LAYOUTS) expect(new Set(l.panels).size).toBe(3);
    expect(new Set(CASHIER_LAYOUTS.map((l) => l.id)).size).toBe(CASHIER_LAYOUTS.length);
  });

  it("chap qo'lda to'lov chapda, o'ngda esa o'ngda; ikki qo'lda o'rtada", () => {
    const pos = (id: string) => CASHIER_LAYOUTS.find((l) => l.id === id)!.panels.indexOf('pay');
    expect(pos('right')).toBe(2);
    expect(pos('left')).toBe(0);
    expect(pos('center')).toBe(1);
    expect(pos('center-flip')).toBe(1);
  });

  it('faqat chap qo\'lda tugmalar ko\'zgulanadi', () => {
    expect(CASHIER_LAYOUTS.filter((l) => cashierMirrorsActions(l.id)).map((l) => l.id)).toEqual(['left']);
  });

  it('tekshiruvchilar', () => {
    expect(isCashierLayout('left')).toBe(true);
    expect(isCashierLayout('x')).toBe(false);
    expect(isHandLayout('both-split')).toBe(true);
    expect(isHandLayout(undefined)).toBe(false);
  });

  it('mobil qoidalar', () => {
    expect(HAND_LAYOUTS).toHaveLength(4);
    expect(handRules('right')).toMatchObject({ headerDirection: 'row', addDirection: 'row', splitStepper: false, edgeMinus: false });
    expect(handRules('left')).toMatchObject({ headerDirection: 'row-reverse', addDirection: 'row-reverse' });
    expect(handRules('both-edges').edgeMinus).toBe(true);
    expect(handRules('both-split').splitStepper).toBe(true);
  });
});
