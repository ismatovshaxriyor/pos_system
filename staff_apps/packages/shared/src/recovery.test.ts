import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FoundServer } from './discovery';
import { recoverServer, ServerWatcher, type RecoveryDeps } from './recovery';

const mk = (url: string, restaurant_id: string | null): FoundServer => ({
  url,
  info: { service: 'pos-bola', version: '0.3.25', activated: true, restaurant_id, restaurant_name: 'R', is_blocked: false, server_time: '' },
});

/** `fetch` soxtasi: faqat `alive` dagi manzillar javob beradi (har biri o'z restoran ID'si bilan). */
function fakeFetch(alive: Record<string, string | null>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const base = String(input).replace('/api/discovery/', '');
    if (!(base in alive)) throw new Error('ECONNREFUSED');
    const info = mk(base, alive[base] ?? null).info;
    return { ok: true, status: 200, json: async () => info } as Response;
  }) as typeof fetch;
}

function setup(over: Partial<RecoveryDeps> & { alive?: Record<string, string | null>; found?: FoundServer[] }) {
  const adopted: Array<[string, string | null]> = [];
  const d: RecoveryDeps = {
    getUrl: () => 'http://10.0.0.5:8000',
    getRestaurantId: () => 'R1',
    adopt: async (u, id) => void adopted.push([u, id]),
    find: async () => over.found ?? [],
    fetchImpl: fakeFetch(over.alive ?? {}),
    probeTimeoutMs: 50,
    ...over,
  };
  return { d, adopted };
}

describe('recoverServer', () => {
  it("manzil javob bersa - hech narsa o'zgarmaydi", async () => {
    const { d, adopted } = setup({ alive: { 'http://10.0.0.5:8000': 'R1' } });
    expect(await recoverServer(d)).toBe('healthy');
    expect(adopted).toEqual([]);
  });

  it("manzil o'lik, restoran boshqa IP'da topildi - yangi manzil saqlanadi", async () => {
    const { d, adopted } = setup({ found: [mk('http://172.20.10.3:8000', 'R1')] });
    expect(await recoverServer(d)).toBe('moved');
    expect(adopted).toEqual([['http://172.20.10.3:8000', 'R1']]);
  });

  it("qo'shni restoranga ULANMAYDI: faqat saqlangan ID mos kelsa", async () => {
    const { d, adopted } = setup({ found: [mk('http://10.0.0.9:8000', 'BOSHQA')] });
    expect(await recoverServer(d)).toBe('lost');
    expect(adopted).toEqual([]);
  });

  it("eski IP'da endi BOSHQA restoran javob beryapti - bizniki qidiriladi", async () => {
    const { d, adopted } = setup({
      alive: { 'http://10.0.0.5:8000': 'BOSHQA' },
      found: [mk('http://10.0.0.7:8000', 'R1')],
    });
    expect(await recoverServer(d)).toBe('moved');
    expect(adopted).toEqual([['http://10.0.0.7:8000', 'R1']]);
  });

  it("hech narsa topilmasa - lost (boshqa tarmoq / server o'chiq)", async () => {
    const { d } = setup({});
    expect(await recoverServer(d)).toBe('lost');
  });

  it("eski o'rnatish (ID yo'q): javob bersa ID eslab qolinadi", async () => {
    const { d, adopted } = setup({ getRestaurantId: () => null, alive: { 'http://10.0.0.5:8000': 'R1' } });
    expect(await recoverServer(d)).toBe('healthy');
    expect(adopted).toEqual([['http://10.0.0.5:8000', 'R1']]);
  });

  it("ID yo'q va manzil o'lik: faqat BITTA server topilsa qabul qilinadi", async () => {
    const one = setup({ getRestaurantId: () => null, found: [mk('http://10.0.0.8:8000', 'R1')] });
    expect(await recoverServer(one.d)).toBe('moved');
    const two = setup({
      getRestaurantId: () => null,
      found: [mk('http://10.0.0.8:8000', 'R1'), mk('http://10.0.0.9:8000', 'R2')],
    });
    expect(await recoverServer(two.d)).toBe('lost');
    expect(two.adopted).toEqual([]);
  });

  it("server tanlanmagan - idle; qidiruv xato bersa ham throw qilmaydi", async () => {
    expect(await recoverServer(setup({ getUrl: () => null }).d)).toBe('idle');
    const { d } = setup({
      find: async () => {
        throw new Error('boom');
      },
    });
    expect(await recoverServer(d)).toBe('lost');
  });
});

describe('ServerWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("davriy tekshiradi: lost bo'lsa tezroq, moved bo'lsa onMoved chaqiradi, stop'dan keyin to'xtaydi", async () => {
    const outcomes = ['lost', 'moved', 'healthy'] as const;
    let i = 0;
    const check = vi.fn(async () => outcomes[Math.min(i++, 2)]!);
    const onMoved = vi.fn();
    const w = new ServerWatcher({ check, onMoved, healthyMs: 1000, lostMs: 100, initialMs: 1000 });
    w.start();
    await vi.advanceTimersByTimeAsync(1000); // 1: lost -> keyingisi 100ms'da
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100); // 2: moved
    expect(check).toHaveBeenCalledTimes(2);
    expect(onMoved).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // 3: healthy
    expect(check).toHaveBeenCalledTimes(3);
    w.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("nudge: kutmasdan tekshiradi, ketayotgan paytda ikkinchisini boshlamaydi", async () => {
    let release!: () => void;
    const check = vi.fn(() => new Promise<'healthy'>((r) => (release = () => r('healthy'))));
    const w = new ServerWatcher({ check, healthyMs: 60_000, initialMs: 60_000 });
    w.start();
    w.nudge();
    w.nudge();
    expect(check).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    w.stop();
  });
});
