import type { MdnsService } from '@pos/shared';

/**
 * Tarmoqdagi Bola serverlarni mDNS (`_pos-bola._tcp`, `local_server/pos-bola.avahi.service`) orqali qidiradi.
 * Native modul (`react-native-zeroconf`) kerak: Expo Go'da YO'Q - bunda bo'sh ro'yxat qaytadi va
 * ulanish ekrani tarmoq skaneriga tayanadi. Hech qachon throw qilmaydi.
 */
export function browseMdns(timeoutMs = 2500): Promise<MdnsService[]> {
  return new Promise((resolve) => {
    const found: MdnsService[] = [];
    let zc: { scan: (...a: unknown[]) => void; stop: () => void; removeDeviceListeners?: () => void; on: (e: string, cb: (x: never) => void) => void } | null =
      null;
    try {
      // Dinamik require: Expo Go'da native modul yo'qligi import paytida emas, shu yerda ushlanadi.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Zeroconf = require('react-native-zeroconf').default;
      zc = new Zeroconf();
      zc!.on('resolved', ((s: { host?: string; port: number; addresses?: string[] }) => {
        found.push({ host: s.host, port: s.port, addresses: s.addresses ?? [] });
      }) as never);
      zc!.on('error', (() => {}) as never);
      zc!.scan('pos-bola', 'tcp', 'local.');
    } catch {
      resolve([]);
      return;
    }
    setTimeout(() => {
      try {
        zc?.stop();
        zc?.removeDeviceListeners?.();
      } catch {
        /* ignore */
      }
      resolve(found);
    }, timeoutMs);
  });
}
