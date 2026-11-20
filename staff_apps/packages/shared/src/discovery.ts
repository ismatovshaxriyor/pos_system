/**
 * Bola serverini tarmoqdan o'zi topish. Hamma platformada (Expo Go, Electron, Android) ishlashi uchun
 * mDNS emas, balki mahalliy /24 tarmoqni skanerlash: har manzilga `GET /api/discovery/` (ochiq ping,
 * `service === 'pos-bola'`) yuboriladi. mDNS native modul talab qiladi (Expo Go'da yo'q), skaner esa faqat `fetch`.
 */
import { normalizeBaseUrl } from './client';
import type { DiscoveryInfo } from './types';

export interface FoundServer {
  /** Ulanish uchun asos manzil, masalan `http://192.168.1.50:8000`. */
  url: string;
  info: DiscoveryInfo;
}

export interface ScanProgress {
  done: number;
  total: number;
}

export interface FindServersOptions {
  /** Qurilmaning o'z IPv4 manzillari (subnet shundan olinadi). Bo'sh bo'lsa faqat `extraUrls` tekshiriladi. */
  localIps: string[];
  ports?: number[];
  /** Skanerdan oldin tekshiriladigan tayyor manzillar (`localhost:8000`, `pos-bola.local:8000`...). */
  extraUrls?: string[];
  fetchImpl?: typeof fetch;
  /** Bitta LAN manzil uchun kutish (javob bermaydigan manzil shuncha vaqt kutiladi). */
  timeoutMs?: number;
  /**
   * Tayyor nomzodlardan (mDNS, localhost) server topilgan bo'lsa ham butun /24 tarmoqni skanerlash.
   * Standart `false`: skaner ~250 ta ulanish ochadi, Chromium'da (Electron) bekor qilingan ulanishlar
   * havzani ~10 soniya band qilib, keyingi so'rovlarni (masalan ulanishni) sekinlashtiradi.
   */
  scanIfFound?: boolean;
  /** `extraUrls` uchun kutish: bular ehtimoli yuqori nomzodlar, sekin birinchi javobga ham chidaydi. */
  extraTimeoutMs?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (p: ScanProgress) => void;
  /** Har topilgan server darhol (skaner tugamasidan) xabar qilinadi. */
  onFound?: (s: FoundServer) => void;
  /**
   * Manzil HTTP bilan javob berdi-yu, lekin rad etildi (`res.ok === false`, masalan 400/403/502) -
   * "u yerda hech narsa yo'q" (timeout/connection refused, `null`) dan farqli holat: aslida
   * o'sha manzilda server bor, lekin noto'g'ri sozlangan (masalan ALLOWED_HOSTS'da LAN IP yo'q)
   * yoki eski/mos kelmaydigan versiya. UI buni ko'rsatib, "topilmadi" emas, aniqroq xabar berishi mumkin.
   */
  onRejected?: (url: string, status: number) => void;
}

export const DEFAULT_PORTS = [8000];

/** mDNS (`_pos-bola._tcp`) orqali topilgan xizmat. Platformaga xos kutubxona shu ko'rinishga keltiradi. */
export interface MdnsService {
  host?: string;
  port: number;
  addresses?: string[];
}

/**
 * mDNS natijalarini tekshiriladigan manzillarga aylantiradi. IPv4 afzal (DNS'siz ham ishlaydi),
 * `.local` nomi faqat IPv4 bo'lmasa. mDNS javobiga ISHONILMAYDI: har bir manzil baribir
 * `GET /api/discovery/` bilan tasdiqlanadi (`findServers`).
 */
export function mdnsToUrls(services: MdnsService[]): string[] {
  const out: string[] = [];
  for (const s of services) {
    if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) continue;
    const v4 = (s.addresses ?? []).filter((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a));
    if (v4.length > 0) {
      for (const a of v4) out.push(`http://${a}:${s.port}`);
    } else if (s.host) {
      out.push(`http://${s.host.replace(/\.$/, '')}:${s.port}`);
    }
  }
  return [...new Set(out)];
}

/** 10.x, 172.16-31.x, 192.168.x - faqat shu tarmoqlar skanerlanadi (jamoat IP'larini tekshirmaymiz). */
export function isPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number) as [number, number, number, number];
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Berilgan IP'lar /24 tarmoqlaridagi barcha boshqa manzillar (o'zimizniki va .0/.255 tashqari),
 * takrorsiz. Server odatda past raqamli manzilda bo'ladi, shuning uchun tartib o'sish bo'yicha.
 */
export function hostsToScan(localIps: string[]): string[] {
  const own = new Set(localIps);
  const prefixes = [...new Set(localIps.filter(isPrivateIPv4).map((ip) => ip.split('.').slice(0, 3).join('.')))];
  const out: string[] = [];
  for (const prefix of prefixes) {
    for (let i = 1; i <= 254; i++) {
      const ip = `${prefix}.${i}`;
      if (!own.has(ip)) out.push(ip);
    }
  }
  return out;
}

/** Bitta manzilni tekshiradi: haqiqiy Bola bo'lsa `FoundServer`, aks holda `null` (hech qachon throw qilmaydi). */
export async function probeServer(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; onReject?: (status: number) => void } = {},
): Promise<FoundServer | null> {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = normalizeBaseUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 800);
  const onOuterAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await doFetch(`${base}/api/discovery/`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // Javob keldi (timeout/connection refused emas) - demak shu manzilda SERVER bor, faqat rad etdi.
      opts.onReject?.(res.status);
      return null;
    }
    const info = (await res.json()) as Partial<DiscoveryInfo>;
    if (info?.service !== 'pos-bola') return null;
    return { url: base, info: info as DiscoveryInfo };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Avval `extraUrls`, keyin mahalliy tarmoqni skanerlaydi. Topilgan serverlar ro'yxati qaytadi
 * (bir xil manzil takrorlanmaydi). `signal` bilan to'xtatiladi - bunda shu paytgacha topilgani qaytadi.
 */
export async function findServers(opts: FindServersOptions): Promise<FoundServer[]> {
  const ports = opts.ports ?? DEFAULT_PORTS;
  const found = new Map<string, FoundServer>();
  const add = (s: FoundServer | null) => {
    if (s && !found.has(s.url)) {
      found.set(s.url, s);
      opts.onFound?.(s);
    }
  };

  const extra = [...new Set((opts.extraUrls ?? []).map((u) => normalizeBaseUrl(u)))];
  const extraSet = new Set(extra);
  const lan = [...new Set(hostsToScan(opts.localIps).flatMap((ip) => ports.map((p) => `http://${ip}:${p}`)))].filter(
    (u) => !extraSet.has(u),
  );
  const total = extra.length + lan.length;
  let done = 0;
  const tick = () => opts.onProgress?.({ done: ++done, total });

  // 1-bosqich: tayyor nomzodlar (hammasi bir vaqtda, uzunroq timeout bilan).
  await Promise.all(
    extra.map(async (u) => {
      const base = normalizeBaseUrl(u);
      add(
        await probeServer(u, {
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.extraTimeoutMs ?? 2500,
          signal: opts.signal,
          onReject: (status) => opts.onRejected?.(base, status),
        }),
      );
      tick();
    }),
  );

  // Tayyor nomzoddan topilgan bo'lsa, og'ir LAN skaneri kerak emas.
  if (found.size > 0 && !opts.scanIfFound) return [...found.values()];

  // 2-bosqich: LAN'ni skanerlash.
  let next = 0;
  const concurrency = Math.max(1, opts.concurrency ?? 48);

  async function worker() {
    while (!opts.signal?.aborted) {
      const i = next++;
      if (i >= lan.length) return;
      const u = lan[i]!;
      add(
        await probeServer(u, {
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
          signal: opts.signal,
          onReject: (status) => opts.onRejected?.(u, status),
        }),
      );
      tick();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(lan.length, 1)) }, worker));
  return [...found.values()];
}
