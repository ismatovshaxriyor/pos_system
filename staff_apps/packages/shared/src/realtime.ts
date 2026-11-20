import { WsCloseCode, type WsEvent } from './types';

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'stopped';

/** Server ulanishni qaytarib bo'lmaydigan sababda yopsa (qayta urinish foydasiz). */
export type FatalCloseReason = 'unauthorized' | 'license_blocked' | 'device_revoked';

/**
 * Ulanish uzilib qayta ochilganda sintetik event: uzilish paytida o'tkazib
 * yuborilgan o'zgarishlar bo'lishi mumkin, shuning uchun ilova `bootstrap`ni
 * qayta so'rashi kerak. (Server hodisalarni saqlamaydi/qayta yubormaydi.)
 */
export const RESYNC_EVENT = 'client_resync';

export interface RealtimeConfig {
  getBaseUrl: () => string | null;
  getToken: () => string | null;
  getDeviceId: () => string | null;
  /** Sukut bo'yicha global `WebSocket` (React Native va Electron brauzer muhitida bor). */
  webSocketImpl?: typeof WebSocket;
  onFatalClose?: (reason: FatalCloseReason) => void;
  /**
   * Server har 20s `ping` yuboradi (`core/consumers.py`). Shuncha vaqt hech narsa
   * kelmasa ulanish "zombi" (router NAT'ni unutgan) deb hisoblanib qayta ochiladi.
   */
  staleAfterMs?: number;
  backoffInitialMs?: number;
  backoffMaxMs?: number;
}

type Handler = (event: WsEvent) => void;

export function buildWsUrl(baseUrl: string, token: string, deviceId: string | null): string {
  const ws = baseUrl.replace(/^http/i, 'ws'); // http→ws, https→wss
  const qs = new URLSearchParams({ token });
  if (deviceId) qs.set('device_id', deviceId);
  return `${ws}/ws/events/?${qs.toString()}`;
}

export class RealtimeClient {
  private readonly cfg: Required<Pick<RealtimeConfig, 'staleAfterMs' | 'backoffInitialMs' | 'backoffMaxMs'>> &
    RealtimeConfig;
  private socket: WebSocket | null = null;
  private status: RealtimeStatus = 'idle';
  private handlers = new Map<string, Set<Handler>>();
  private statusListeners = new Set<(s: RealtimeStatus) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private attempt = 0;
  private lastMessageAt = 0;
  private hasConnectedBefore = false;

  constructor(config: RealtimeConfig) {
    this.cfg = {
      staleAfterMs: 60_000,
      backoffInitialMs: 1_000,
      backoffMaxMs: 15_000,
      ...config,
    };
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  onStatus(listener: (s: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** `'*'` - barcha eventlar. Noma'lum event turlari ham keladi - e'tiborsiz qoldirish handler'ning ishi. */
  on(event: string, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  }

  start(): void {
    if (this.status !== 'idle' && this.status !== 'stopped') return;
    this.attempt = 0;
    this.connect();
  }

  stop(): void {
    this.clearTimers();
    this.setStatus('stopped');
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try {
        s.close(1000);
      } catch {
        /* allaqachon yopiq */
      }
    }
  }

  // ---- ichki ---------------------------------------------------------------

  private setStatus(next: RealtimeStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.retryTimer = null;
    this.watchdog = null;
  }

  private connect(): void {
    const base = this.cfg.getBaseUrl();
    const token = this.cfg.getToken();
    const WS = this.cfg.webSocketImpl ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!base || !token || !WS) {
      this.setStatus('stopped');
      return;
    }

    this.setStatus(this.hasConnectedBefore ? 'reconnecting' : 'connecting');
    const socket = new WS(buildWsUrl(base, token, this.cfg.getDeviceId()));
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      const wasReconnect = this.hasConnectedBefore;
      this.hasConnectedBefore = true;
      this.setStatus('open');
      this.startWatchdog();
      if (wasReconnect) this.dispatch({ event: RESYNC_EVENT, data: {} });
    };

    socket.onmessage = (msg: MessageEvent) => {
      if (this.socket !== socket) return;
      this.lastMessageAt = Date.now();
      let parsed: WsEvent;
      try {
        parsed = JSON.parse(String(msg.data)) as WsEvent;
      } catch {
        return; // buzuq xabar ulanishni buzmasin
      }
      if (parsed && typeof parsed.event === 'string') this.dispatch(parsed);
    };

    socket.onerror = () => {
      /* onclose ham keladi - qayta ulanish o'sha yerda hal qilinadi */
    };

    socket.onclose = (ev: CloseEvent) => {
      if (this.socket !== socket) return; // eskirgan socket
      this.socket = null;
      if (this.watchdog) clearInterval(this.watchdog);
      this.watchdog = null;

      const fatal = fatalReason(ev.code);
      if (fatal) {
        this.setStatus('stopped');
        this.cfg.onFatalClose?.(fatal);
        return;
      }
      this.scheduleReconnect();
    };
  }

  private dispatch(event: WsEvent): void {
    this.handlers.get(event.event)?.forEach((h) => h(event));
    this.handlers.get('*')?.forEach((h) => h(event));
  }

  private startWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    const check = Math.max(1_000, Math.floor(this.cfg.staleAfterMs / 4));
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastMessageAt > this.cfg.staleAfterMs) {
        // close() ba'zan "zombi" socketda onclose'ni darrov chaqirmaydi - qo'lda davom etamiz.
        const s = this.socket;
        this.socket = null;
        if (s) {
          s.onopen = s.onmessage = s.onclose = s.onerror = null;
          try {
            s.close();
          } catch {
            /* ignore */
          }
        }
        if (this.watchdog) clearInterval(this.watchdog);
        this.watchdog = null;
        this.scheduleReconnect();
      }
    }, check);
  }

  private scheduleReconnect(): void {
    if (this.status === 'stopped') return;
    this.setStatus('reconnecting');
    // Eksponensial kutish + jitter: restoran WiFi'si qaytganda barcha qurilmalar bir vaqtda urilmasin.
    const exp = Math.min(this.cfg.backoffMaxMs, this.cfg.backoffInitialMs * 2 ** this.attempt);
    const delay = exp / 2 + Math.random() * (exp / 2);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.status !== 'stopped') this.connect();
    }, delay);
  }
}

function fatalReason(code: number): FatalCloseReason | null {
  if (code === WsCloseCode.Unauthorized) return 'unauthorized';
  if (code === WsCloseCode.LicenseBlocked) return 'license_blocked';
  if (code === WsCloseCode.DeviceRevoked) return 'device_revoked';
  return null;
}
