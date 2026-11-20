import { createApi, type PosApi } from './api';
import { createApiClient, normalizeBaseUrl, type ApiClient } from './client';
import { RealtimeClient, type FatalCloseReason } from './realtime';
import type { AppKind } from './roles';
import { SessionManager, type KeyValueStorage } from './session';
import type { User } from './types';
import { uuidv4 } from './uuid';

export interface PosOptions {
  app: AppKind;
  storage: KeyValueStorage;
  secureStorage?: KeyValueStorage;
  generateId?: () => string;
  fetchImpl?: typeof fetch;
  webSocketImpl?: typeof WebSocket;
}

export interface Pos {
  session: SessionManager;
  client: ApiClient;
  api: PosApi;
  realtime: RealtimeClient;
  loginManager(phone: string, password: string): Promise<User>;
  loginWaiter(phone: string, password: string, deviceLabel?: string): Promise<User>;
  loginPin(pin: string): Promise<User>;
  registerDevice(p: { phone: string; code: string; pin: string; deviceLabel?: string }): Promise<User>;
  /** Server haqiqiy "pos-bola" ekanini tekshiradi va manzilni saqlaydi. */
  connectToServer(url: string): Promise<{ restaurantName: string; activated: boolean }>;
  /** Bloklangan ekranda "Qayta tekshirish": `true` - blok olingan. */
  recheckLicense(): Promise<boolean>;
}

const FATAL_NOTICE: Record<FatalCloseReason, string> = {
  unauthorized: 'Sessiya yaroqsiz. Qayta kiring.',
  license_blocked: '',
  device_revoked: "Bu qurilma o'chirildi yoki boshqa qurilma tasdiqlandi. Menejerga murojaat qiling.",
};

/**
 * Ikkala ilova uchun yagona "kompozitsiya ildizi": sessiya + HTTP client +
 * tiplangan API + real-time bir-biriga to'g'ri ulangan holda.
 */
export function createPos(opts: PosOptions): Pos {
  const session = new SessionManager({
    app: opts.app,
    storage: opts.storage,
    secureStorage: opts.secureStorage,
    generateId: opts.generateId ?? uuidv4,
  });

  const client = createApiClient({
    getBaseUrl: session.getBaseUrl,
    getToken: session.getToken,
    getDeviceId: session.getDeviceId,
    fetchImpl: opts.fetchImpl,
    onUnauthorized: () => {
      void session.signOut('Sessiya tugadi yoki qurilma oʼchirildi. Qayta kiring.');
    },
    onLicenseBlocked: () => session.markLicenseBlocked(),
  });

  const api = createApi(client);

  const realtime = new RealtimeClient({
    getBaseUrl: session.getBaseUrl,
    getToken: session.getToken,
    getDeviceId: session.getDeviceId,
    webSocketImpl: opts.webSocketImpl,
    onFatalClose: (reason) => {
      if (reason === 'license_blocked') session.markLicenseBlocked();
      else void session.signOut(FATAL_NOTICE[reason]);
    },
  });

  const deviceId = () => session.getDeviceId() ?? '';

  return {
    session,
    client,
    api,
    realtime,

    async loginManager(phone, password) {
      const { token } = await api.auth.managerLogin(phone, password);
      session.setPendingToken(token);
      try {
        const user = await api.auth.me();
        await session.signIn({ token, user });
        return user;
      } catch (e) {
        session.setPendingToken(null);
        throw e;
      }
    },

    async loginWaiter(phone, password, deviceLabel) {
      const auth = await api.auth.waiterLogin({
        phone,
        password,
        device_id: deviceId(),
        device_label: deviceLabel,
      });
      await session.signIn(auth);
      return auth.user;
    },

    async loginPin(pin) {
      const auth = await api.auth.pinLogin({ device_id: deviceId(), pin });
      await session.signIn(auth);
      return auth.user;
    },

    async registerDevice({ phone, code, pin, deviceLabel }) {
      const auth = await api.auth.registerDevice({
        phone,
        code,
        pin,
        device_id: deviceId(),
        device_label: deviceLabel,
      });
      await session.signIn(auth);
      return auth.user;
    },

    async connectToServer(url) {
      // Avval alohida client bilan tekshiramiz, MANZILNI FAQAT TO'G'RI BO'LSA saqlaymiz -
      // aks holda xato manzil saqlanib, ilova login ekraniga o'tib ketardi.
      const baseUrl = normalizeBaseUrl(url);
      const probe = createApi(
        createApiClient({
          getBaseUrl: () => baseUrl,
          getToken: () => null,
          getDeviceId: () => null,
          fetchImpl: opts.fetchImpl,
          timeoutMs: 6_000,
        }),
      );
      const info = await probe.discovery();
      if (info.service !== 'pos-bola') {
        throw new Error('Bu manzildagi server POS tizimi emas.');
      }
      await session.setServerUrl(baseUrl);
      if (info.is_blocked) session.markLicenseBlocked();
      return { restaurantName: info.restaurant_name, activated: info.activated };
    },

    async recheckLicense() {
      const info = await api.discovery();
      if (!info.is_blocked) session.clearLicenseBlocked();
      return !info.is_blocked;
    },
  };
}
