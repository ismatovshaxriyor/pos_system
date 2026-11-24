import {
  DEFAULT_HAND_LAYOUT,
  DEFAULT_MENU_STYLE,
  DEFAULT_TABLE_COLS,
  handRules,
  isHandLayout,
  isMenuStyle,
  isTableCols,
  isTextScale,
  isThemePref,
  paletteFor,
  resolveTheme,
  textScaleFactor,
  type HandLayout,
  type HandRules,
  type MenuStyle,
  type Palette,
  type TableCols,
  type TextScale,
  type ThemeName,
  type ThemePref,
} from '@pos/design';
import KVStore from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Ko'z uchun sozlamalar. Har qurilmada alohida saqlanadi (serverga yuborilmaydi). */
export interface Appearance {
  theme: ThemePref;
  textScale: TextScale;
  reduceMotion: boolean;
  /** Qo'lga moslash: elementlar joylashuvi (o'ng / chap / ikki qo'l). */
  hand: HandLayout;
  /** Buyurtma olishda menyu ko'rinishi: ro'yxat / ixcham / rasmli kartochkalar. */
  menuStyle: MenuStyle;
  /** Bosh ekranda bir qatorda nechta stol: avto (telefonda 3, planshetda 4) yoki 2/3/4. */
  tableCols: TableCols;
  /** Taom rasmlari ko'rinsinmi (sekin internet yoki ixcham ko'rinish uchun o'chirish mumkin). */
  showImages: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'auto',
  textScale: 'normal',
  reduceMotion: false,
  hand: DEFAULT_HAND_LAYOUT,
  menuStyle: DEFAULT_MENU_STYLE,
  tableCols: DEFAULT_TABLE_COLS,
  showImages: true,
};

const KEY = 'pos.mobile.appearance.v1';

function parse(raw: string | null): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const v = JSON.parse(raw) as Partial<Appearance>;
    return {
      theme: isThemePref(v.theme) ? v.theme : DEFAULT_APPEARANCE.theme,
      textScale: isTextScale(v.textScale) ? v.textScale : DEFAULT_APPEARANCE.textScale,
      reduceMotion: v.reduceMotion === true,
      hand: isHandLayout(v.hand) ? v.hand : DEFAULT_APPEARANCE.hand,
      menuStyle: isMenuStyle(v.menuStyle) ? v.menuStyle : DEFAULT_APPEARANCE.menuStyle,
      tableCols: isTableCols(v.tableCols) ? v.tableCols : DEFAULT_APPEARANCE.tableCols,
      showImages: typeof v.showImages === 'boolean' ? v.showImages : DEFAULT_APPEARANCE.showImages,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

interface ThemeValue {
  c: Palette;
  name: ThemeName;
  appearance: Appearance;
  /** Matn o'lchami ko'paytiruvchisi (1 / 1.125 / 1.25) */
  scale: number;
  setAppearance: (patch: Partial<Appearance>) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setState] = useState<Appearance>(DEFAULT_APPEARANCE);
  // `auto` rejimida soat o'tganda mavzu o'zi almashsin.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    KVStore.getItem(KEY)
      .then((raw) => alive && setState(parse(raw)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      KVStore.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const name = resolveTheme(appearance.theme, now);
    return { c: paletteFor(name), name, appearance, scale: textScaleFactor(appearance.textScale), setAppearance };
  }, [appearance, now, setAppearance]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme ThemeProvider ichida ishlatilishi kerak');
  return v;
}

/** Joriy qo'l joylashuvi qoidalari (sarlavha tomoni, "+"/"−" tugmalari). */
export function useHand(): HandRules {
  const { appearance } = useTheme();
  return useMemo(() => handRules(appearance.hand), [appearance.hand]);
}

/** @expo-google-fonts nomlari (har vazn alohida oila - RN'da `fontWeight` maxsus shriftda ishonchsiz). */
export const FONT = {
  body400: 'Archivo_400Regular',
  body500: 'Archivo_500Medium',
  body600: 'Archivo_600SemiBold',
  disp: 'BigShouldersDisplay_700Bold',
  mono400: 'IBMPlexMono_400Regular',
  mono500: 'IBMPlexMono_500Medium',
} as const;
