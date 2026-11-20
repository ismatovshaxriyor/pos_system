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
} as const;

/** Maxfiy saqlashga faqat shu prefiksli kalitlar ruxsat etiladi (main tomonda tekshiriladi). */
export const SECURE_KEY_PREFIX = 'pos.';

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
  platform: string;
}
