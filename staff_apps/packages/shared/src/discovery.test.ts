import { describe, expect, it } from 'vitest';

import { findServers, hostsToScan, isPrivateIPv4, mdnsToUrls, mergeFound, probeServer } from './discovery';

const INFO = {
  service: 'pos-bola',
  version: '0.3.21',
  activated: true,
  restaurant_id: 'r1',
  restaurant_name: 'Test',
  is_blocked: false,
  server_time: '2026-11-20T10:00:00Z',
};

/** Faqat `servers` ro'yxatidagi manzillar javob beradi; qolganlari `signal` abort bo'lguncha osilib turadi (LAN'dagi bo'sh manzildek). */
function fakeFetch(servers: Record<string, unknown>): typeof fetch {
  return ((input: string, init?: { signal?: AbortSignal }) => {
    const url = String(input);
    const hit = Object.keys(servers).find((k) => url.startsWith(k));
    if (hit) return Promise.resolve({ ok: true, json: async () => servers[hit] } as Response);
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  }) as unknown as typeof fetch;
}

/** Berilgan manzillarga HTTP javob keladi-yu, lekin rad etiladi (masalan ALLOWED_HOSTS 400); qolganlari osilib turadi. */
function fakeFetchRejecting(rejecting: Record<string, number>): typeof fetch {
  return ((input: string, init?: { signal?: AbortSignal }) => {
    const url = String(input);
    const hit = Object.keys(rejecting).find((k) => url.startsWith(k));
    if (hit) return Promise.resolve({ ok: false, status: rejecting[hit] } as Response);
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  }) as unknown as typeof fetch;
}

describe('isPrivateIPv4', () => {
  it('faqat xususiy tarmoqlarni qabul qiladi', () => {
    expect(isPrivateIPv4('192.168.1.50')).toBe(true);
    expect(isPrivateIPv4('10.0.3.7')).toBe(true);
    expect(isPrivateIPv4('172.20.0.5')).toBe(true);
    expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('192.168.1.999')).toBe(false);
    expect(isPrivateIPv4('fe80::1')).toBe(false);
  });
});

describe('hostsToScan', () => {
  it("o'z manzilini tashlab, /24 dagi 253 ta manzilni beradi", () => {
    const hosts = hostsToScan(['192.168.1.50']);
    expect(hosts).toHaveLength(253);
    expect(hosts).not.toContain('192.168.1.50');
    expect(hosts[0]).toBe('192.168.1.1');
    expect(hosts.at(-1)).toBe('192.168.1.254');
  });

  it('bir nechta tarmoq va takrorlarni to\'g\'ri boshqaradi, jamoat IP\'ni o\'tkazib yuboradi', () => {
    const hosts = hostsToScan(['192.168.1.50', '192.168.1.51', '10.0.0.4', '8.8.8.8']);
    expect(new Set(hosts).size).toBe(hosts.length);
    expect(hosts).toContain('10.0.0.1');
    expect(hosts.some((h) => h.startsWith('8.8.8'))).toBe(false);
  });
});

describe('probeServer', () => {
  it('haqiqiy Bola topiladi, manzil normallashtiriladi', async () => {
    const r = await probeServer('192.168.1.5:8000', { fetchImpl: fakeFetch({ 'http://192.168.1.5:8000/api/discovery/': INFO }) });
    expect(r?.url).toBe('http://192.168.1.5:8000');
    expect(r?.info.restaurant_name).toBe('Test');
  });

  it("boshqa servis (service != pos-bola) rad etiladi", async () => {
    const r = await probeServer('http://x:8000', { fetchImpl: fakeFetch({ 'http://x:8000': { service: 'nginx' } }) });
    expect(r).toBeNull();
  });

  it('javob bermasa timeout bilan null (throw qilmaydi)', async () => {
    const r = await probeServer('http://10.0.0.9:8000', { fetchImpl: fakeFetch({}), timeoutMs: 20 });
    expect(r).toBeNull();
  });

  it("server javob berib rad etsa (masalan 400) onReject chaqiriladi, natija baribir null", async () => {
    let rejected: number | null = null;
    const r = await probeServer('http://192.168.1.188:8000', {
      fetchImpl: fakeFetchRejecting({ 'http://192.168.1.188:8000/api/discovery/': 400 }),
      onReject: (status) => (rejected = status),
    });
    expect(r).toBeNull();
    expect(rejected).toBe(400);
  });
});

describe('findServers', () => {
  it('tarmoqdagi serverni topadi va progressni xabar qiladi', async () => {
    const seen: string[] = [];
    let last = { done: 0, total: 0 };
    const res = await findServers({
      localIps: ['192.168.1.50'],
      fetchImpl: fakeFetch({ 'http://192.168.1.77:8000/': INFO }),
      timeoutMs: 15, extraTimeoutMs: 15,
      concurrency: 100,
      onFound: (s) => seen.push(s.url),
      onProgress: (p) => (last = p),
    });
    expect(res.map((s) => s.url)).toEqual(['http://192.168.1.77:8000']);
    expect(seen).toEqual(['http://192.168.1.77:8000']);
    expect(last).toEqual({ done: 253, total: 253 });
  });

  it("extraUrls (localhost) ham tekshiriladi, takror manzil bir marta qaytadi", async () => {
    const res = await findServers({
      localIps: [],
      extraUrls: ['localhost:8000', 'http://localhost:8000'],
      fetchImpl: fakeFetch({ 'http://localhost:8000/': INFO }),
      timeoutMs: 15, extraTimeoutMs: 15,
    });
    expect(res).toHaveLength(1);
    expect(res[0]!.url).toBe('http://localhost:8000');
  });

  it("tayyor manzildan topilsa LAN skanerlanmaydi (scanIfFound=false)", async () => {
    let lanProbes = 0;
    const inner = fakeFetch({ 'http://localhost:8000/': INFO });
    const res = await findServers({
      localIps: ['192.168.1.50'],
      extraUrls: ['localhost:8000'],
      fetchImpl: ((u: string, i: never) => {
        if (String(u).startsWith('http://192.168.')) lanProbes++;
        return (inner as unknown as (a: string, b: never) => Promise<Response>)(u, i);
      }) as unknown as typeof fetch,
      timeoutMs: 15,
      extraTimeoutMs: 15,
    });
    expect(res).toHaveLength(1);
    expect(lanProbes).toBe(0);
  });

  it("ikkita server bo'lsa ikkalasi ham ro'yxatda", async () => {
    const res = await findServers({
      localIps: ['10.0.0.4'],
      fetchImpl: fakeFetch({
        'http://10.0.0.20:8000/': INFO,
        'http://10.0.0.21:8000/': { ...INFO, restaurant_name: 'Boshqa', activated: false, restaurant_id: null },
      }),
      timeoutMs: 15, extraTimeoutMs: 15,
      concurrency: 100,
    });
    expect(res.map((s) => s.url).sort()).toEqual(['http://10.0.0.20:8000', 'http://10.0.0.21:8000']);
  });

  it("hech narsa topilmasa-yu, biror manzil rad etsa, onRejected chaqiriladi", async () => {
    let rejected: { url: string; status: number } | null = null;
    const res = await findServers({
      localIps: ['192.168.1.50'],
      fetchImpl: fakeFetchRejecting({ 'http://192.168.1.188:8000/api/discovery/': 400 }),
      timeoutMs: 15, extraTimeoutMs: 15,
      concurrency: 100,
      onRejected: (url, status) => (rejected = { url, status }),
    });
    expect(res).toEqual([]);
    expect(rejected).toEqual({ url: 'http://192.168.1.188:8000', status: 400 });
  });

  it("signal bilan to'xtatilganda tez qaytadi", async () => {
    const ctrl = new AbortController();
    const t = Date.now();
    setTimeout(() => ctrl.abort(), 30);
    await findServers({ localIps: ['192.168.1.50'], fetchImpl: fakeFetch({}), timeoutMs: 5000, signal: ctrl.signal });
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('mdnsToUrls', () => {
  it('IPv4 manzillarni afzal ko\'radi, IPv6 va takrorlarni tashlaydi', () => {
    expect(
      mdnsToUrls([
        { host: 'pos.local.', port: 8000, addresses: ['fe80::1', '192.168.1.50'] },
        { host: 'pos.local.', port: 8000, addresses: ['192.168.1.50'] },
      ]),
    ).toEqual(['http://192.168.1.50:8000']);
  });

  it("IPv4 bo'lmasa host nomini (oxirgi nuqtasiz) ishlatadi", () => {
    expect(mdnsToUrls([{ host: 'pos-bola.local.', port: 8000, addresses: [] }])).toEqual(['http://pos-bola.local:8000']);
  });

  it("noto'g'ri port yoki manzilsiz yozuvni o'tkazib yuboradi", () => {
    expect(mdnsToUrls([{ port: 0, addresses: ['10.0.0.1'] }, { port: 8000 }, { host: 'x', port: 70000 }])).toEqual([]);
  });
});

describe('bitta server - bir nechta manzil', () => {
  it('mergeFound: bir xil restaurant_id boshqa manzil orqali kelsa takrorlanmaydi', () => {
    const a = { url: 'http://localhost:8000', info: INFO };
    const b = { url: 'http://10.0.0.5:8000', info: INFO };
    expect(mergeFound(mergeFound([], a), b)).toEqual([a]);
  });

  it('mergeFound: aktivlashmagan (restaurant_id yo\'q) serverlar manzil bo\'yicha farqlanadi', () => {
    const a = { url: 'http://10.0.0.5:8000', info: { ...INFO, restaurant_id: null } };
    const b = { url: 'http://10.0.0.6:8000', info: { ...INFO, restaurant_id: null } };
    expect(mergeFound(mergeFound([], a), b)).toEqual([a, b]);
    expect(mergeFound([a], a)).toEqual([a]);
  });

  it('mergeFound: boshqa restoran qo\'shiladi', () => {
    const a = { url: 'http://10.0.0.5:8000', info: INFO };
    const b = { url: 'http://10.0.0.6:8000', info: { ...INFO, restaurant_id: 'r2' } };
    expect(mergeFound([a], b)).toHaveLength(2);
  });

  it('findServers: localhost va LAN manzil bitta serverga olib borsa bir marta qaytadi', async () => {
    const seen: string[] = [];
    const res = await findServers({
      localIps: [],
      extraUrls: ['localhost:8000', '10.0.0.5:8000'],
      fetchImpl: fakeFetch({ 'http://localhost:8000/': INFO, 'http://10.0.0.5:8000/': INFO }),
      onFound: (s) => seen.push(s.url),
    });
    expect(res).toHaveLength(1);
    expect(seen).toHaveLength(1);
  });
});
