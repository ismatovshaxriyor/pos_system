import { describe, expect, it } from 'vitest';
import { SessionManager, WrongAppError, type KeyValueStorage } from './session';
import type { User } from './types';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const user = (role: User['role']): User => ({ id: 1, username: '+998901234567', first_name: 'Ali', last_name: '', role });

describe('SessionManager', () => {
  it('birinchi ishga tushishda device_id yaratadi va saqlaydi (keyin oʼzgarmaydi)', async () => {
    const storage = memoryStorage();
    let n = 0;
    const make = () => new SessionManager({ app: 'mobile', storage, generateId: () => `id-${++n}` });

    const a = make();
    await a.load();
    expect(a.getState().deviceId).toBe('id-1');
    expect(a.getState().status).toBe('signed_out');

    const b = make();
    await b.load();
    expect(b.getState().deviceId).toBe('id-1'); // qayta yaratilmadi
  });

  it('signIn dan keyin qayta ochilganda sessiya tiklanadi', async () => {
    const storage = memoryStorage();
    const mk = () => new SessionManager({ app: 'mobile', storage, generateId: () => 'd' });
    const a = mk();
    await a.load();
    await a.signIn({ token: 'T', user: user('waiter') });
    const b = mk();
    await b.load();
    expect(b.getState()).toMatchObject({ status: 'signed_in', token: 'T' });
  });

  it('mobil ilovada kassir kira olmaydi, token saqlanmaydi', async () => {
    const storage = memoryStorage();
    const s = new SessionManager({ app: 'mobile', storage, generateId: () => 'd' });
    await s.load();
    await expect(s.signIn({ token: 'T', user: user('cashier') })).rejects.toBeInstanceOf(WrongAppError);
    expect(s.getState().token).toBeNull();
    expect(storage.data.has('pos.token')).toBe(false);
  });

  it('kassa ilovasida ofitsiant kira olmaydi, menejer kira oladi', async () => {
    const s = new SessionManager({ app: 'cashier', storage: memoryStorage(), generateId: () => 'd' });
    await s.load();
    await expect(s.signIn({ token: 'T', user: user('waiter') })).rejects.toBeInstanceOf(WrongAppError);
    await expect(s.signIn({ token: 'T', user: user('manager') })).resolves.toBeUndefined();
  });

  it('boshqa ilova roli bilan saqlangan sessiya ochilmaydi', async () => {
    const storage = memoryStorage();
    storage.data.set('pos.token', 'T');
    storage.data.set('pos.user', JSON.stringify(user('cashier')));
    const s = new SessionManager({ app: 'mobile', storage, generateId: () => 'd' });
    await s.load();
    expect(s.getState().status).toBe('signed_out');
  });

  it('signOut tokenni oʼchiradi va sababni qoldiradi; subscribe xabar beradi', async () => {
    const storage = memoryStorage();
    const s = new SessionManager({ app: 'mobile', storage, generateId: () => 'd' });
    await s.load();
    await s.signIn({ token: 'T', user: user('waiter') });
    let calls = 0;
    s.subscribe(() => calls++);
    await s.signOut('Qurilma oʼchirildi');
    expect(calls).toBe(1);
    expect(s.getState()).toMatchObject({ status: 'signed_out', token: null, notice: 'Qurilma oʼchirildi' });
    expect(storage.data.has('pos.token')).toBe(false);
  });

  it('buzuq saqlangan user JSON’da yiqilmaydi', async () => {
    const storage = memoryStorage();
    storage.data.set('pos.token', 'T');
    storage.data.set('pos.user', '{broken');
    const s = new SessionManager({ app: 'mobile', storage, generateId: () => 'd' });
    await s.load();
    expect(s.getState().status).toBe('signed_out');
  });
});
