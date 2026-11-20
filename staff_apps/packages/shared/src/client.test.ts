import { describe, expect, it, vi } from 'vitest';
import { createApiClient, normalizeBaseUrl } from './client';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  const onUnauthorized = vi.fn();
  const onLicenseBlocked = vi.fn();
  const client = createApiClient({
    getBaseUrl: () => 'http://10.0.0.5:8000',
    getToken: () => 'tok123',
    getDeviceId: () => 'dev-1',
    onUnauthorized,
    onLicenseBlocked,
    fetchImpl,
    ...extra,
  });
  return { client, onUnauthorized, onLicenseBlocked };
}

describe('normalizeBaseUrl', () => {
  it('sxema qoʼshadi, oxirgi / va /api ni olib tashlaydi', () => {
    expect(normalizeBaseUrl('192.168.1.5:8000')).toBe('http://192.168.1.5:8000');
    expect(normalizeBaseUrl(' https://pos.local/api/ ')).toBe('https://pos.local');
  });
});

describe('createApiClient', () => {
  it('Token va X-Device-ID sarlavhalarini yuboradi', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const { client } = setup(fetchImpl as unknown as typeof fetch);
    await client.get('/bootstrap/');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://10.0.0.5:8000/api/bootstrap/');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Token tok123');
    expect(h['X-Device-ID']).toBe('dev-1');
  });

  it('anonim soʼrovda Authorization yubormaydi', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const { client } = setup(fetchImpl as unknown as typeof fetch);
    await client.post('/auth/pin-login/', { pin: '1' }, { anonymous: true });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('401 sessiyani tugatadi (onUnauthorized)', async () => {
    const { client, onUnauthorized } = setup((async () =>
      jsonResponse(401, { detail: 'Token yaroqsiz.' })) as unknown as typeof fetch);
    await expect(client.get('/orders/')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('403 (huquq yoʼq) sessiyani TUGATMAYDI', async () => {
    const { client, onUnauthorized } = setup((async () =>
      jsonResponse(403, { detail: 'Ruxsat yoʼq.' })) as unknown as typeof fetch);
    await expect(client.post('/orders/1/set_discount/', {})).rejects.toMatchObject({ kind: 'forbidden' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('anonim 401 (notoʼgʻri PIN) sessiyani tugatmaydi', async () => {
    const { client, onUnauthorized } = setup((async () =>
      jsonResponse(401, { detail: 'x' })) as unknown as typeof fetch);
    await expect(client.post('/auth/pin-login/', {}, { anonymous: true })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('402 litsenziya bloklanganini bildiradi', async () => {
    const { client, onLicenseBlocked } = setup((async () =>
      jsonResponse(402, { detail: 'Tizim bloklandi.' })) as unknown as typeof fetch);
    await expect(client.get('/orders/')).rejects.toMatchObject({ kind: 'license_blocked' });
    expect(onLicenseBlocked).toHaveBeenCalledTimes(1);
  });

  it('validatsiya xatosi maydonlarini ajratadi', async () => {
    const { client } = setup((async () =>
      jsonResponse(400, {
        detail: 'Validatsiya xatosi.',
        code: 'validation_error',
        fields: { amount: ['Bu maydon majburiy.'] },
      })) as unknown as typeof fetch);
    const err = (await client.post('/orders/1/add_payment/', {}).catch((e) => e)) as ApiError;
    expect(err.kind).toBe('validation');
    expect(err.fields.amount).toEqual(['Bu maydon majburiy.']);
  });

  it('proksi HTML xato sahifasini qaytarsa ham yiqilmaydi', async () => {
    const { client } = setup((async () => new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch);
    await expect(client.get('/orders/')).rejects.toMatchObject({ kind: 'server', status: 502 });
  });

  it('tarmoq uzilsa kind=network', async () => {
    const { client } = setup((async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch);
    const err = (await client.get('/orders/').catch((e) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
  });

  it('204 javobni qabul qiladi', async () => {
    const { client } = setup((async () => new Response(null, { status: 204 })) as unknown as typeof fetch);
    await expect(client.delete('/x/1/')).resolves.toBeNull();
  });

  it('nisbiy media yoʻlini toʻliq URL qiladi', () => {
    const { client } = setup(vi.fn() as unknown as typeof fetch);
    expect(client.absoluteUrl('/media/a.png')).toBe('http://10.0.0.5:8000/media/a.png');
    expect(client.absoluteUrl('https://x/y.png')).toBe('https://x/y.png');
    expect(client.absoluteUrl(null)).toBeNull();
  });
});
