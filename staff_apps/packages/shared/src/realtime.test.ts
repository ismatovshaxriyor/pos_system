import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWsUrl, RealtimeClient, RESYNC_EVENT, type FatalCloseReason } from './realtime';
import type { WsEvent } from './types';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  message(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  serverClose(code: number) {
    this.onclose?.({ code });
  }
}

function make(onFatalClose?: (r: FatalCloseReason) => void) {
  return new RealtimeClient({
    getBaseUrl: () => 'http://10.0.0.5:8000',
    getToken: () => 'tok',
    getDeviceId: () => 'dev 1',
    webSocketImpl: FakeSocket as unknown as typeof WebSocket,
    onFatalClose,
    backoffInitialMs: 1000,
    backoffMaxMs: 4000,
    staleAfterMs: 60_000,
  });
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('buildWsUrl', () => {
  it('http→ws, https→wss, parametrlar kodlanadi', () => {
    expect(buildWsUrl('http://h:8000', 't', 'a b')).toBe('ws://h:8000/ws/events/?token=t&device_id=a+b');
    expect(buildWsUrl('https://h', 't', null)).toBe('wss://h/ws/events/?token=t');
  });
});

describe('RealtimeClient', () => {
  it('eventlarni tinglovchilarga va "*" ga yetkazadi, buzuq xabarni eʼtiborsiz qoldiradi', () => {
    const rt = make();
    const specific = vi.fn();
    const all = vi.fn();
    rt.on('order_updated', specific);
    rt.on('*', all);
    rt.start();
    const s = FakeSocket.instances[0]!;
    s.open();
    s.message({ event: 'order_updated', data: { order_id: 7 } } satisfies WsEvent);
    s.onmessage?.({ data: '{not json' });
    s.message({ event: 'brand_new_event', data: {} });
    expect(specific).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(2); // noma'lum event ham keladi, buzuq esa yo'q
  });

  it('uzilganda eksponensial kutish bilan qayta ulanadi va RESYNC yuboradi', () => {
    const rt = make();
    const resync = vi.fn();
    rt.on(RESYNC_EVENT, resync);
    rt.start();
    FakeSocket.instances[0]!.open();
    expect(resync).not.toHaveBeenCalled(); // birinchi ulanishda resync kerak emas

    FakeSocket.instances[0]!.serverClose(1006);
    expect(rt.getStatus()).toBe('reconnecting');
    vi.advanceTimersByTime(1000); // 1-urinish kutishi ≤ 1000ms
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[1]!.open();
    expect(rt.getStatus()).toBe('open');
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it.each([
    [4001, 'unauthorized'],
    [4402, 'license_blocked'],
    [4403, 'device_revoked'],
  ] as const)('%i kodida qayta ulanmaydi (%s)', (code, reason) => {
    const fatal = vi.fn();
    const rt = make(fatal);
    rt.start();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.serverClose(code);
    expect(fatal).toHaveBeenCalledWith(reason);
    expect(rt.getStatus()).toBe('stopped');
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('"zombi" ulanishni (60s xabarsiz) aniqlab qayta ochadi', () => {
    const rt = make();
    rt.start();
    const first = FakeSocket.instances[0]!;
    first.open();
    vi.advanceTimersByTime(61_000 + 15_000); // watchdog + reconnect kutishi
    expect(first.closed).toBe(true);
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it('ping xabarlari ulanishni "tirik" ushlab turadi', () => {
    const rt = make();
    rt.start();
    const s = FakeSocket.instances[0]!;
    s.open();
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(20_000);
      s.message({ event: 'ping', data: {} });
    }
    expect(s.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('stop() dan keyin qayta ulanmaydi', () => {
    const rt = make();
    rt.start();
    FakeSocket.instances[0]!.open();
    rt.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(rt.getStatus()).toBe('stopped');
  });

  it('token yoʼq boʼlsa ulanmaydi', () => {
    const rt = new RealtimeClient({
      getBaseUrl: () => 'http://h',
      getToken: () => null,
      getDeviceId: () => 'd',
      webSocketImpl: FakeSocket as unknown as typeof WebSocket,
    });
    rt.start();
    expect(FakeSocket.instances).toHaveLength(0);
  });
});
