import { findServers, mdnsToUrls, type FoundServer } from '@pos/shared';

/**
 * Tarmoqdan restoran serverini qidiradi (IP o'zgarganda avtomatik qayta topish uchun, `useServerRecovery`).
 * Ulanish ekranidagi qidiruv bilan bir xil manbalar: mDNS + mahalliy /24 skaneri. Hech qachon throw qilmaydi.
 */
export async function findServerOnNetwork(signal: AbortSignal): Promise<FoundServer[]> {
  let localIps: string[] = [];
  try {
    localIps = await window.posNative.network.localAddresses();
  } catch {
    /* manzilsiz ham localhost/mDNS tekshiriladi */
  }
  let mdnsUrls: string[] = [];
  try {
    mdnsUrls = mdnsToUrls(await window.posNative.network.browseMdns());
  } catch {
    /* mDNS bo'lmasa skaner ishlaydi */
  }
  // Tezkor urinish, topilmasa sekin tarmoq uchun uzunroq timeout.
  for (const timeoutMs of [800, 2000]) {
    if (signal.aborted) return [];
    const found = await findServers({
      localIps,
      extraUrls: [...mdnsUrls, 'localhost:8000', 'pos-bola.local:8000'],
      timeoutMs,
      extraTimeoutMs: Math.max(2500, timeoutMs),
      signal,
    });
    if (found.length > 0) return found;
  }
  return [];
}
