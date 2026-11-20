import { light, night, type Palette } from './tokens';

export type ThemeName = 'light' | 'night';
/** Foydalanuvchi tanlovi: `auto` - kechqurun avtomatik tungi mavzu. */
export type ThemePref = ThemeName | 'auto';

/** Avto rejim: 19:00 dan 07:00 gacha tungi mavzu (restoran kechqurun qorong'ilashadi). */
export const NIGHT_FROM_HOUR = 19;
export const NIGHT_TO_HOUR = 7;

export function resolveTheme(pref: ThemePref, now: Date = new Date()): ThemeName {
  if (pref !== 'auto') return pref;
  const h = now.getHours();
  return h >= NIGHT_FROM_HOUR || h < NIGHT_TO_HOUR ? 'night' : 'light';
}

export function paletteFor(theme: ThemeName): Palette {
  return theme === 'night' ? night : light;
}

export type TextScale = 'normal' | 'large' | 'xlarge';

export const TEXT_SCALES: Record<TextScale, number> = { normal: 1, large: 1.125, xlarge: 1.25 };

export function textScaleFactor(scale: TextScale): number {
  return TEXT_SCALES[scale] ?? 1;
}

export function isThemePref(v: unknown): v is ThemePref {
  return v === 'light' || v === 'night' || v === 'auto';
}

export function isTextScale(v: unknown): v is TextScale {
  return v === 'normal' || v === 'large' || v === 'xlarge';
}
