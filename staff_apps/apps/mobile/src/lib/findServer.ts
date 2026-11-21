import { findServers, mdnsToUrls, type FoundServer } from '@pos/shared';
import { getIpAddressAsync } from 'expo-network';

import { browseMdns } from './mdns';

/**
 * Tarmoqdan restoran serverini qidiradi (IP o'zgarganda avtomatik qayta topish uchun, `useServerRecovery`).
 * Ulanish ekranidagi qidiruv bilan bir xil manbalar: mDNS + telefon WiFi'sining /24 skaneri. Hech qachon throw qilmaydi.
 */
export async function findServerOnNetwork(signal: AbortSignal): Promise<FoundServer[]> {
  let localIps: string[] = [];
  try {
    localIps = [await getIpAddressAsync()];
  } catch {
    /* WiFi'ga ulanmagan - faqat mDNS/nom bilan tekshiriladi */
  }
  const mdnsUrls = mdnsToUrls(await browseMdns());
  for (const timeoutMs of [800, 2000]) {
    if (signal.aborted) return [];
    const found = await findServers({
      localIps,
      ports: __DEV__ ? [8000, 8010, 8020] : [8000],
      extraUrls: [...mdnsUrls, 'pos-bola.local:8000'],
      timeoutMs,
      extraTimeoutMs: Math.max(2500, timeoutMs),
      signal,
    });
    if (found.length > 0) return found;
  }
  return [];
}
