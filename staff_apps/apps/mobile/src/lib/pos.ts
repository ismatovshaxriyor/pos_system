import { createPos, type KeyValueStorage } from '@pos/shared';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import KVStore from 'expo-sqlite/kv-store';

/** Server manzili, device_id, foydalanuvchi profili - maxfiy emas. */
const plainStorage: KeyValueStorage = {
  getItem: (k) => KVStore.getItem(k),
  setItem: (k, v) => KVStore.setItem(k, v),
  removeItem: async (k) => {
    await KVStore.removeItem(k);
  },
};

/** DRF tokeni - iOS Keychain / Android Keystore. Kalitda `.` ruxsat etilgan. */
const secureStorage: KeyValueStorage = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

/** `Order.sync_uuid` kabi klient yaratadigan ID'lar uchun (RN'da global `crypto` kafolatlanmagan). */
export const newUuid = (): string => Crypto.randomUUID();

/** Butun ilova uchun yagona instansiya (sessiya + API + real-time). */
export const pos = createPos({
  app: 'mobile',
  storage: plainStorage,
  secureStorage,
  generateId: newUuid,
});
