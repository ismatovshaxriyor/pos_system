/**
 * HamrohPOS ilovalari ranglari ("Shveytsariya tartibi", yumshoq uslub).
 * Bu fayl React Native uchun; veb (kassir) `tokens.css` ni ishlatadi. Ikkalasi bir xil bo'lishi
 * `tokens.test.ts` da tekshiriladi - biriga o'zgartirish kiritsangiz, ikkinchisiga ham kiriting.
 *
 * Rang qoidasi: `signal` (qizil) = ekrandagi bitta eng muhim amal va xatolar. `ok`/`warn` faqat HOLAT
 * (chap chiziq, nuqta, pilyula) uchun, matn rangi sifatida emas.
 */
export interface Palette {
  /** Umumiy fon */
  paper: string;
  /** Segment/tray va ikkilamchi yuza */
  panel: string;
  /** Kartochka, panel, kiritish maydoni */
  card: string;
  /** Tanlangan element foni (qora to'ldirish emas, och tus) */
  sel: string;
  ink: string;
  /** Ikkilamchi matn */
  ink60: string;
  /** Chiziqlar */
  grid: string;
  /** Holatsiz (neytral) chap chiziq */
  edge: string;
  signal: string;
  onSignal: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  /** warnSoft fonidagi matn */
  warnInk: string;
  /** Modal ostidagi xira parda */
  dim: string;
  /** "Kassa yopiq" banneri (har ikki mavzuda to'q) */
  banner: string;
  onBanner: string;
}

export const light: Palette = {
  paper: '#F1F0EB',
  panel: '#E7E6E0',
  card: '#FFFFFF',
  sel: '#E9E8E1',
  ink: '#1F1F1E',
  ink60: '#66665F',
  grid: '#DAD9D2',
  edge: '#B3B2AB',
  signal: '#D4261F',
  onSignal: '#FFFFFF',
  ok: '#2E7D5B',
  okSoft: 'rgba(46, 125, 91, 0.14)',
  warn: '#C98A1D',
  warnSoft: 'rgba(201, 138, 29, 0.18)',
  warnInk: '#80530A',
  dim: 'rgba(31, 31, 30, 0.45)',
  banner: '#2B2B29',
  onBanner: '#F1F0EB',
};

export const night: Palette = {
  paper: '#171716',
  panel: '#1F1F1E',
  card: '#222221',
  sel: '#2D2D2B',
  ink: '#E6E6E0',
  ink60: '#9B9B93',
  grid: '#33332F',
  edge: '#4D4D48',
  signal: '#FF5249',
  onSignal: '#171716',
  ok: '#58C795',
  okSoft: 'rgba(88, 199, 149, 0.16)',
  warn: '#E5AE44',
  warnSoft: 'rgba(229, 174, 68, 0.16)',
  warnInk: '#E5AE44',
  dim: 'rgba(0, 0, 0, 0.6)',
  banner: '#2B2B29',
  onBanner: '#F1F0EB',
};

/** CSS font-family nomlari (veb). React Native'da shriftlar nomi alohida - mobil ilovaning `ui/theme` iga qarang. */
export const fontFamilies = {
  body: 'Archivo',
  display: 'Big Shoulders Display',
  mono: 'IBM Plex Mono',
} as const;
