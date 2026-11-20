/**
 * Ilovaning o'zini yangilash: Bola (restoran serveri) `/api/license/app-updates/` orqali "yangi versiya bormi?"
 * ga javob beradi va o'rnatuvchi faylni LAN'dan beradi. Internet kerak emas.
 */

export interface AppUpdateRelease {
  slug: string;
  version: string;
  size_mb: string;
  sha256: string;
  notes: string[];
  /** Bola'ga nisbatan yo'l (`/api/license/app-updates/<id>/download/`). */
  download_url: string;
}

export interface AppUpdateInfo {
  available: boolean;
  /** Majburiy: eski versiya ishlashda davom etmasligi kerak (menejer Ona'da belgilagan). */
  required: boolean;
  latest: AppUpdateRelease | null;
}

export type AppUpdatePlatform = 'android' | 'windows';

/** '1.10.0' > '1.9.9' (raqamli, matnli emas). Raqam bo'lmagan qismlar ('beta') e'tiborsiz. Bola bilan bir xil qoida. */
export function compareVersions(a: string, b: string): number {
  const pa = (a.match(/\d+/g) ?? []).map(Number);
  const pb = (b.match(/\d+/g) ?? []).map(Number);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Yangilanish haqiqatan kerakmi (server javobiga ko'r-ko'rona ishonmay, o'zimiz ham solishtiramiz). */
export function needsUpdate(info: AppUpdateInfo | null, current: string): boolean {
  return !!info?.available && !!info.latest && compareVersions(info.latest.version, current) > 0;
}

/** Majburiy yangilanish: ilova ishlashdan oldin bloklanadi. */
export function mustUpdate(info: AppUpdateInfo | null, current: string): boolean {
  return needsUpdate(info, current) && !!info?.required;
}
