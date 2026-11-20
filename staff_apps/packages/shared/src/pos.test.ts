import { describe, expect, it, vi } from 'vitest';
import { createPos } from './pos';
import type { KeyValueStorage } from './session';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const discovery = (over: Record<string, unknown> = {}) => ({
  service: 'pos-bola',
  version: '1',
  activated: true,
  restaurant_id: 'r1',
  restaurant_name: 'Osh markazi',
  is_blocked: false,
  server_time: '2026-01-01T00:00:00Z',
  ...over,
});

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('createPos.connectToServer', () => {
  it('toʼgʻri server manzilini saqlaydi', async () => {
    const storage = memoryStorage();
    const pos = createPos({
      app: 'mobile',
      storage,
      generateId: () => 'd',
      fetchImpl: (async () => ok(discovery())) as unknown as typeof fetch,
    });
    await pos.session.load();
    const res = await pos.connectToServer('192.168.1.5:8000');
    expect(res.restaurantName).toBe('Osh markazi');
    expect(pos.session.getState().serverUrl).toBe('http://192.168.1.5:8000');
    expect(storage.data.get('pos.serverUrl')).toBe('http://192.168.1.5:8000');
  });

  it('POS boʼlmagan serverda manzilni SAQLAMAYDI', async () => {
    const storage = memoryStorage();
    const pos = createPos({
      app: 'mobile',
      storage,
      generateId: () => 'd',
      fetchImpl: (async () => ok({ service: 'nginx' })) as unknown as typeof fetch,
    });
    await pos.session.load();
    await expect(pos.connectToServer('10.0.0.1')).rejects.toThrow('restoran tizimi topilmadi');
    expect(pos.session.getState().serverUrl).toBeNull();
  });

  it('ulanib boʼlmasa manzilni SAQLAMAYDI', async () => {
    const pos = createPos({
      app: 'mobile',
      storage: memoryStorage(),
      generateId: () => 'd',
      fetchImpl: (async () => {
        throw new TypeError('fail');
      }) as unknown as typeof fetch,
    });
    await pos.session.load();
    await expect(pos.connectToServer('10.0.0.1')).rejects.toMatchObject({ kind: 'network' });
    expect(pos.session.getState().serverUrl).toBeNull();
  });

  it('bloklangan serverda status license_blocked boʼlib, recheck blokni olib tashlaydi', async () => {
    let blocked = true;
    const pos = createPos({
      app: 'mobile',
      storage: memoryStorage(),
      generateId: () => 'd',
      fetchImpl: (async () => ok(discovery({ is_blocked: blocked }))) as unknown as typeof fetch,
    });
    await pos.session.load();
    await pos.connectToServer('10.0.0.1');
    expect(pos.session.getState().status).toBe('license_blocked');
    blocked = false;
    await expect(pos.recheckLicense()).resolves.toBe(true);
    expect(pos.session.getState().status).toBe('signed_out');
  });

  it('401 kelganda sessiya avtomatik tugaydi (qurilma revoke qilingan)', async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/discovery/')) return ok(discovery());
      return new Response(JSON.stringify({ detail: 'Qurilma topilmadi' }), { status: 401 });
    });
    const pos = createPos({ app: 'mobile', storage, generateId: () => 'd', fetchImpl: fetchImpl as unknown as typeof fetch });
    await pos.session.load();
    await pos.connectToServer('10.0.0.1');
    await pos.session.signIn({
      token: 'T',
      user: { id: 1, username: '+998901234567', first_name: 'A', last_name: '', role: 'waiter' },
    });
    await expect(pos.api.bootstrap()).rejects.toMatchObject({ kind: 'unauthorized' });
    await vi.waitFor(() => expect(pos.session.getState().status).toBe('signed_out'));
    expect(pos.session.getState().notice).toContain('Qayta kiring');
  });
});

describe('createPos: yangi (faollashtirilmagan) server', () => {
  it('faollashtirilmagan serverga ulanilganda "needs_activation" holatiga o\'tadi (login emas)', async () => {
    const pos = createPos({
      app: 'mobile',
      storage: memoryStorage(),
      generateId: () => 'd',
      fetchImpl: (async () => ok(discovery({ activated: false, restaurant_id: null }))) as unknown as typeof fetch,
    });
    await pos.session.load();
    const res = await pos.connectToServer('192.168.1.5:8000');
    expect(res.activated).toBe(false);
    expect(pos.session.getState().status).toBe('needs_activation');
    expect(pos.session.getState().serverUrl).toBe('http://192.168.1.5:8000');
  });

  it('faol server - login ekrani, "needs_activation" EMAS', async () => {
    const pos = createPos({
      app: 'mobile',
      storage: memoryStorage(),
      generateId: () => 'd',
      fetchImpl: (async () => ok(discovery())) as unknown as typeof fetch,
    });
    await pos.session.load();
    await pos.connectToServer('192.168.1.5:8000');
    expect(pos.session.getState().status).toBe('signed_out');
  });

  it('activateLicense kalitni yuboradi va login ekraniga o\'tkazadi', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const pos = createPos({
      app: 'mobile',
      storage: memoryStorage(),
      generateId: () => 'd',
      fetchImpl: (async (input: string, init?: { body?: string }) => {
        const url = String(input);
        calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
        if (url.endsWith('/api/license/activate/')) return ok({ restaurant: { id: 'r1', name: 'Yangi Restoran' } });
        return ok(discovery({ activated: false, restaurant_id: null }));
      }) as unknown as typeof fetch,
    });
    await pos.session.load();
    await pos.connectToServer('10.0.0.2:8000');
    expect(pos.session.getState().status).toBe('needs_activation');
    const res = await pos.activateLicense('  4D3H-BAK6-7DDR ');
    expect(res.restaurantName).toBe('Yangi Restoran');
    expect(pos.session.getState().status).toBe('signed_out');
    expect(calls.at(-1)).toMatchObject({ url: 'http://10.0.0.2:8000/api/license/activate/', body: { license_key: '4D3H-BAK6-7DDR' } });
  });

  it('refreshServerState: ilova qayta ochilganda faollashtirilmagan server aniqlanadi', async () => {
    let activated = false;
    const pos = createPos({
      app: 'mobile',
      storage: memoryStorage(),
      generateId: () => 'd',
      fetchImpl: (async () => ok(discovery({ activated }))) as unknown as typeof fetch,
    });
    await pos.session.load();
    await pos.connectToServer('10.0.0.2:8000');
    await pos.refreshServerState();
    expect(pos.session.getState().status).toBe('needs_activation');
    activated = true; // operator boshqa qurilmadan faollashtirdi
    await pos.refreshServerState();
    expect(pos.session.getState().status).toBe('signed_out');
  });
});
