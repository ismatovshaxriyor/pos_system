import { describe, expect, it } from 'vitest';

import { isWaiterCallForUser, mergeWaiterCall, waiterCallTableLabel, type CallWaiterData } from './waiterCall';

const call = (over: Partial<CallWaiterData> = {}): CallWaiterData => ({
  notification_id: 1,
  table_id: 5,
  table_name: '11',
  reason: 'Ofitsiant chaqiruvi',
  message: '11 stolidan chaqiruv: Ofitsiant chaqiruvi',
  created_at: '2026-11-22T05:08:00Z',
  ...over,
});

describe('isWaiterCallForUser', () => {
  it('shows a call without a table waiter to everyone', () => {
    expect(isWaiterCallForUser(call({ waiter_id: null }), 7)).toBe(true);
    // Eski server (0.3.29 dan oldin) waiter_id yubormaydi.
    expect(isWaiterCallForUser(call(), 7)).toBe(true);
  });

  it('shows a call with a table waiter only to that waiter', () => {
    expect(isWaiterCallForUser(call({ waiter_id: 7 }), 7)).toBe(true);
    expect(isWaiterCallForUser(call({ waiter_id: 7 }), 8)).toBe(false);
  });
});

describe('mergeWaiterCall', () => {
  it('queues calls from different tables in arrival order', () => {
    const list = mergeWaiterCall(mergeWaiterCall([], call()), call({ table_id: 6, table_name: '12' }));
    expect(list.map((c) => c.tableId)).toEqual([5, 6]);
  });

  it('folds a repeated call from the same table into one entry', () => {
    const first = mergeWaiterCall([], call());
    const list = mergeWaiterCall(first, call({ reason: 'Hisob', created_at: '2026-11-22T05:09:00Z' }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ count: 2, reason: 'Hisob', at: '2026-11-22T05:09:00Z' });
  });
});

describe('waiterCallTableLabel', () => {
  it('adds "-stol" only to purely numeric names', () => {
    expect(waiterCallTableLabel('11')).toBe('11-stol');
    expect(waiterCallTableLabel('VIP 2')).toBe('VIP 2');
  });
});
