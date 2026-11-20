import { normalizeBaseUrl } from './client';
import { canUseApp, wrongAppMessage, type AppKind } from './roles';
import type { AuthResponse, User } from './types';

/** Platformaga bog'liq saqlash (AsyncStorage / SecureStore / Electron). */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type SessionStatus =
  /** Saqlangan holat hali o'qilmoqda. */
  | 'loading'
  | 'signed_out'
  | 'signed_in'
  /** Litsenziya bloklangan - login ekrani emas, "to'lov qiling" ekrani ko'rsatiladi. */
  | 'license_blocked';

export interface SessionState {
  status: SessionStatus;
  serverUrl: string | null;
  /** Qurilmaning doimiy ID'si (`X-Device-ID`). Bir marta yaratiladi, hech qachon o'zgarmaydi. */
  deviceId: string;
  token: string | null;
  user: User | null;
  /** Oxirgi majburiy chiqish sababi (login ekranida ko'rsatish uchun). */
  notice: string | null;
}

export class WrongAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongAppError';
  }
}

const KEYS = {
  serverUrl: 'pos.serverUrl',
  deviceId: 'pos.deviceId',
  token: 'pos.token',
  user: 'pos.user',
} as const;

export interface SessionManagerOptions {
  app: AppKind;
  /** Oddiy saqlash: server manzili, device_id. */
  storage: KeyValueStorage;
  /** Token uchun xavfsiz saqlash (Keychain/SecureStore/safeStorage). Berilmasa `storage`. */
  secureStorage?: KeyValueStorage;
  generateId: () => string;
}

/**
 * Framework'dan mustaqil sessiya holati. React'da `useSyncExternalStore(
 * session.subscribe, session.getState)` bilan ulanadi (ikkala ilovada ham ishlaydi).
 */
export class SessionManager {
  private state: SessionState = {
    status: 'loading',
    serverUrl: null,
    deviceId: '',
    token: null,
    user: null,
    notice: null,
  };
  private listeners = new Set<() => void>();
  private readonly secure: KeyValueStorage;

  constructor(private readonly opts: SessionManagerOptions) {
    this.secure = opts.secureStorage ?? opts.storage;
  }

  // Arrow funksiyalar - `useSyncExternalStore`ga to'g'ridan-to'g'ri berish uchun.
  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getBaseUrl = (): string | null => this.state.serverUrl;
  getToken = (): string | null => this.state.token;
  getDeviceId = (): string | null => this.state.deviceId || null;

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Ilova ishga tushganda bir marta. */
  async load(): Promise<void> {
    const { storage } = this.opts;
    const [serverUrl, storedDeviceId, token, userJson] = await Promise.all([
      storage.getItem(KEYS.serverUrl),
      storage.getItem(KEYS.deviceId),
      this.secure.getItem(KEYS.token),
      storage.getItem(KEYS.user),
    ]);

    let deviceId = storedDeviceId;
    if (!deviceId) {
      deviceId = this.opts.generateId();
      await storage.setItem(KEYS.deviceId, deviceId);
    }

    let user: User | null = null;
    if (userJson) {
      try {
        user = JSON.parse(userJson) as User;
      } catch {
        user = null;
      }
    }
    // Rol tekshiruvi qayta: ilova boshqa rol bilan saqlangan sessiyani ochmasin.
    const valid = !!token && !!user && canUseApp(this.opts.app, user.role);
    this.set({
      serverUrl,
      deviceId,
      token: valid ? token : null,
      user: valid ? user : null,
      status: valid ? 'signed_in' : 'signed_out',
    });
  }

  async setServerUrl(input: string): Promise<void> {
    const url = normalizeBaseUrl(input);
    await this.opts.storage.setItem(KEYS.serverUrl, url);
    this.set({ serverUrl: url });
  }

  /** "Serverni o'zgartirish": manzilni va joriy sessiyani tozalaydi. */
  async clearServer(): Promise<void> {
    await this.signOut();
    await this.opts.storage.removeItem(KEYS.serverUrl);
    this.set({ serverUrl: null });
  }

  /**
   * Menejer login'ida server avval faqat token beradi, `user` esa keyingi
   * `/users/me/` so'rovidan keladi - shu oraliq uchun tokenni vaqtincha qo'yamiz
   * (status `signed_out` qoladi).
   */
  setPendingToken(token: string | null): void {
    this.set({ token });
  }

  /** @throws WrongAppError - rol shu ilovaga mos kelmasa (token ham tashlab yuboriladi). */
  async signIn(auth: AuthResponse): Promise<void> {
    const msg = wrongAppMessage(this.opts.app, auth.user.role);
    if (msg) {
      this.set({ token: null });
      throw new WrongAppError(msg);
    }
    await Promise.all([
      this.secure.setItem(KEYS.token, auth.token),
      this.opts.storage.setItem(KEYS.user, JSON.stringify(auth.user)),
    ]);
    this.set({ token: auth.token, user: auth.user, status: 'signed_in', notice: null });
  }

  /** `notice` - login ekranida ko'rsatiladigan sabab (masalan "Qurilma o'chirildi"). */
  async signOut(notice: string | null = null): Promise<void> {
    await Promise.all([this.secure.removeItem(KEYS.token), this.opts.storage.removeItem(KEYS.user)]);
    this.set({ token: null, user: null, status: 'signed_out', notice });
  }

  markLicenseBlocked(): void {
    this.set({ status: 'license_blocked' });
  }

  /** Litsenziya tiklangach (masalan status qayta tekshirilganda) login ekraniga qaytish. */
  clearLicenseBlocked(): void {
    if (this.state.status === 'license_blocked') {
      this.set({ status: this.state.token && this.state.user ? 'signed_in' : 'signed_out' });
    }
  }
}
