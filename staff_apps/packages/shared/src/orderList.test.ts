import { describe, expect, it } from 'vitest';

import { filterOrders, orderLabel, sortOpenOrders, stepSelection } from './orderList';
import type { Order } from './types';

function order(id: number, table: string | null, waiter: string | null, created: string): Order {
  return {
    id,
    table: table ? ({ id, name: table } as Order['table']) : null,
    waiter: waiter ? ({ id, first_name: waiter, last_name: 'Aliyev' } as Order['waiter']) : null,
    created_at: created,
  } as Order;
}

const A = order(1, 'Stol 5', 'Jasur', '2026-11-20T10:00:00Z');
const B = order(2, 'VIP 1', 'Nodira', '2026-11-20T09:00:00Z');
const C = order(13, null, null, '2026-11-20T11:00:00Z');

describe('sortOpenOrders', () => {
  it('eng eskisi birinchi, asl massivni buzmaydi', () => {
    const src = [A, B, C];
    expect(sortOpenOrders(src).map((o) => o.id)).toEqual([2, 1, 13]);
    expect(src.map((o) => o.id)).toEqual([1, 2, 13]);
  });
});

describe('filterOrders', () => {
  it("bo'sh so'rov - hammasi", () => {
    expect(filterOrders([A, B], '  ')).toHaveLength(2);
  });
  it('stol nomi, ofitsiant va raqam bo\'yicha, harf farqsiz', () => {
    expect(filterOrders([A, B, C], 'vip').map((o) => o.id)).toEqual([2]);
    expect(filterOrders([A, B, C], 'jasur').map((o) => o.id)).toEqual([1]);
    expect(filterOrders([A, B, C], 'aliyev')).toHaveLength(2);
    expect(filterOrders([A, B, C], '#13').map((o) => o.id)).toEqual([13]);
  });
  it('bir nechta so\'z - hammasi mos kelishi kerak', () => {
    expect(filterOrders([A, B, C], 'stol jasur').map((o) => o.id)).toEqual([1]);
    expect(filterOrders([A, B, C], 'stol nodira')).toEqual([]);
  });
});

describe('stepSelection', () => {
  const list = [B, A, C];
  it('tanlov yo\'q - chetdan boshlanadi', () => {
    expect(stepSelection(list, null, 1)).toBe(2);
    expect(stepSelection(list, null, -1)).toBe(13);
  });
  it('qadam va chegaralar', () => {
    expect(stepSelection(list, 2, 1)).toBe(1);
    expect(stepSelection(list, 13, 1)).toBe(13);
    expect(stepSelection(list, 2, -1)).toBe(2);
  });
  it("bo'sh ro'yxat", () => {
    expect(stepSelection([], 5, 1)).toBeNull();
  });
});

describe('orderLabel', () => {
  it('stol nomi, stolsiz buyurtma turi bo\u02bcyicha nomlanadi', () => {
    expect(orderLabel(A)).toBe('Stol 5');
    expect(orderLabel({ ...C, order_type: 'takeaway' })).toBe('Olib ketish #13');
    expect(orderLabel({ ...C, order_type: 'delivery' })).toBe('Yetkazish #13');
    expect(orderLabel({ ...C, order_type: 'dine_in' })).toBe('#13');
  });

  it('qidiruv "olib ketish" so\u02bczi bilan stolsiz buyurtmani topadi', () => {
    const t = { ...C, order_type: 'takeaway' } as Order;
    expect(filterOrders([A, B, t], 'olib ketish')).toEqual([t]);
  });
});
