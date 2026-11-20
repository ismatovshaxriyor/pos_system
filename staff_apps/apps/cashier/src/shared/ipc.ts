import type { MdnsService } from '@pos/shared';

/**
 * Main ↔ preload ↔ renderer o'rtasidagi IPC shartnomasi (yagona manba).
 * Renderer `window.posNative` orqali faqat shu kanallarga chiqa oladi.
 */
export const IPC = {
  secureGet: 'secure:get',
  secureSet: 'secure:set',
  secureRemove: 'secure:remove',
  toggleFullscreen: 'window:toggle-fullscreen',
  quit: 'app:quit',
  appVersion: 'app:version',
  localAddresses: 'network:local-addresses',
  browseMdns: 'network:browse-mdns',
  installUpdate: 'update:install',
  updateProgress: 'update:progress',
} as const;

/** Maxfiy saqlashga faqat shu prefiksli kalitlar ruxsat etiladi (main tomonda tekshiriladi). */
export const SECURE_KEY_PREFIX = 'pos.';

export type InstallUpdateResult = { ok: true } | { ok: false; error: string };

export interface PosNativeApi {
  /** Token kabi maxfiy qiymatlar - Windows DPAPI (Electron `safeStorage`) bilan shifrlangan. */
  secure: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  window: {
    toggleFullscreen(): Promise<boolean>;
    quit(): Promise<void>;
  };
  /** Ilovaning o'z yangilanishi (faqat Windows): Bola'dan yuklab, sha256 tekshirib, o'rnatib, qayta ochadi. */
  updates: {
    currentVersion(): Promise<string>;
    install(downloadUrl: string, sha256: string): Promise<InstallUpdateResult>;
    onProgress(cb: (percent: number) => void): () => void;
  };
  /** Kompyuterning o'z tarmoq manzillari: restoran serverini /24 tarmoqdan qidirish uchun. */
  network: {
    localAddresses(): Promise<string[]>;
    /** mDNS (`_pos-bola._tcp`) orqali tarmoqdagi Bola serverlarni qidiradi (~2 soniya). */
    browseMdns(): Promise<MdnsService[]>;
  };
  platform: string;
}
