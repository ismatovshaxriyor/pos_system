import { createPos, type KeyValueStorage } from '@pos/shared';

/** Server manzili, device_id, foydalanuvchi profili - maxfiy emas. */
const plainStorage: KeyValueStorage = {
  async getItem(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  async setItem(k, v) {
    localStorage.setItem(k, v);
  },
  async removeItem(k) {
    localStorage.removeItem(k);
  },
};

/**
 * DRF tokeni - main jarayonda Windows DPAPI (`safeStorage`) bilan shifrlanadi.
 * Shifrlash mavjud bo'lmasa token saqlanmaydi va har ishga tushganda PIN so'raladi
 * (jim ochiq-matn zaxirasi yo'q).
 */
const secureStorage: KeyValueStorage = {
  async getItem(k) {
    try {
      return await window.posNative.secure.get(k);
    } catch {
      return null;
    }
  },
  async setItem(k, v) {
    try {
      await window.posNative.secure.set(k, v);
    } catch {
      /* saqlanmadi - keyingi ishga tushishda qayta kiriladi, joriy sessiya xotirada ishlaydi */
    }
  },
  async removeItem(k) {
    try {
      await window.posNative.secure.remove(k);
    } catch {
      /* ignore */
    }
  },
};

export const newUuid = (): string => crypto.randomUUID();

/** Butun ilova uchun yagona instansiya (sessiya + API + real-time). */
export const pos = createPos({
  app: 'cashier',
  storage: plainStorage,
  secureStorage,
  generateId: newUuid,
});
