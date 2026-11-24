import {
  DEFAULT_CASHIER_LAYOUT,
  DEFAULT_TABLE_COLS,
  isCashierLayout,
  isTableCols,
  isTextScale, isThemePref,
  resolveTheme,
  textScaleFactor,
  type CashierLayout,
  type TableCols,
  type TextScale,
  type ThemePref,
} from '@pos/design';
import { useSyncExternalStore } from 'react';

/**
 * Ko'rinish sozlamalari (☰ menyu): mavzu, matn o'lchami, harakat, tovush.
 * Bu terminalning shaxsiy sozlamasi - serverga yuborilmaydi, localStorage'da saqlanadi.
 */
export interface Appearance {
  theme: ThemePref;
  textScale: TextScale;
  reduceMotion: boolean;
  sound: boolean;
  /** Panellar joylashuvi (qo'lga moslash): o'ng / chap / ikki qo'l A / B. */
  layout: CashierLayout;
  /** Stollar katakchalari: bir qatorda nechta (avto - panelga sig'gancha). */
  tableCols: TableCols;
}

const KEY = 'pos.cashier.appearance.v1';
const DEFAULTS: Appearance = { theme: 'auto', textScale: 'normal', reduceMotion: false, sound: true, layout: DEFAULT_CASHIER_LAYOUT, tableCols: DEFAULT_TABLE_COLS };

function read(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Appearance>;
    return {
      theme: isThemePref(p.theme) ? p.theme : DEFAULTS.theme,
      textScale: isTextScale(p.textScale) ? p.textScale : DEFAULTS.textScale,
      reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : DEFAULTS.reduceMotion,
      sound: typeof p.sound === 'boolean' ? p.sound : DEFAULTS.sound,
      layout: isCashierLayout(p.layout) ? p.layout : DEFAULTS.layout,
      tableCols: isTableCols(p.tableCols) ? p.tableCols : DEFAULTS.tableCols,
    };
  } catch {
    return DEFAULTS;
  }
}

let state: Appearance = read();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

/** Holatni <html> ga yozadi: data-theme, --text-scale (rem asosi), data-motion. */
export function applyAppearance(): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(state.theme);
  root.style.setProperty('--text-scale', String(textScaleFactor(state.textScale)));
  root.dataset.motion = state.reduceMotion ? 'reduced' : 'full';
  root.dataset.layout = state.layout;
  root.dataset.tcols = state.tableCols;
}

/** Ilova ishga tushganda bir marta. "Avto" rejim uchun har daqiqa soatni qayta tekshiradi (19:00 da o'zi tunga o'tadi). */
export function startAppearance(): void {
  applyAppearance();
  timer ??= setInterval(applyAppearance, 60_000);
}

export function getAppearance(): Appearance {
  return state;
}

export function setAppearance(patch: Partial<Appearance>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Saqlab bo'lmasa ham sozlama joriy sessiyada ishlaydi.
  }
  applyAppearance();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance);
}
