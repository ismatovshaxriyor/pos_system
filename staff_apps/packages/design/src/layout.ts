/**
 * Elementlar joylashuvi: foydalanuvchi qaysi qo'li bilan ishlashiga qarab. Har qurilmada alohida
 * saqlanadi (☰ menyuda tanlanadi). Raqamli tugmalar (0-9) hech qachon ko'zgulanmaydi - tartibi doim bir xil.
 */

// ---- Kassir (3 ustun: ochiq buyurtmalar | chek | to'lov) ---------------------------------------

export type CashierPanel = 'orders' | 'receipt' | 'pay';

export type CashierLayout = 'right' | 'left' | 'center' | 'center-flip';

export interface CashierLayoutInfo {
  id: CashierLayout;
  label: string;
  hint: string;
  /** Chapdan o'ngga ustunlar tartibi (mini-chizma va CSS `grid-template-areas` uchun). */
  panels: readonly [CashierPanel, CashierPanel, CashierPanel];
}

export const CASHIER_LAYOUTS: readonly CashierLayoutInfo[] = [
  { id: 'right', label: "O'ng qo'l", hint: "To'lov o'ngda", panels: ['orders', 'receipt', 'pay'] },
  { id: 'left', label: "Chap qo'l", hint: "To'lov chapda", panels: ['pay', 'receipt', 'orders'] },
  { id: 'center', label: "Ikki qo'l · A", hint: "To'lov o'rtada, chek o'ngda", panels: ['orders', 'pay', 'receipt'] },
  { id: 'center-flip', label: "Ikki qo'l · B", hint: "To'lov o'rtada, chek chapda", panels: ['receipt', 'pay', 'orders'] },
];

export const DEFAULT_CASHIER_LAYOUT: CashierLayout = 'right';

export function isCashierLayout(v: unknown): v is CashierLayout {
  return CASHIER_LAYOUTS.some((l) => l.id === v);
}

/** "To'lash" / "Yopish" tugmalari ko'zgulansinmi: faqat chap qo'lda (asosiy tugma bosh barmoq tomonda). */
export function cashierMirrorsActions(layout: CashierLayout): boolean {
  return layout === 'left';
}

// ---- Mobil (ofitsiant / menejer) ----------------------------------------------------------------

export type HandLayout = 'right' | 'left' | 'both-edges' | 'both-split';

export interface HandLayoutInfo {
  id: HandLayout;
  label: string;
  hint: string;
}

export const HAND_LAYOUTS: readonly HandLayoutInfo[] = [
  { id: 'right', label: "O'ng qo'l", hint: "\"+\" va menyu o'ngda" },
  { id: 'left', label: "Chap qo'l", hint: "\"+\" va menyu chapda" },
  { id: 'both-edges', label: "Ikki qo'l · chetlarda", hint: "\"−\" chapda, \"+\" o'ngda" },
  { id: 'both-split', label: "Ikki qo'l · katta", hint: 'Tanlangan mahsulotda ikkita katta tugma' },
];

export const DEFAULT_HAND_LAYOUT: HandLayout = 'right';

export function isHandLayout(v: unknown): v is HandLayout {
  return HAND_LAYOUTS.some((l) => l.id === v);
}

export interface HandRules {
  /** Sarlavha qatori: asosiy amal (menyu/orqaga) qaysi chetda. `row-reverse` = chapda. */
  headerDirection: 'row' | 'row-reverse';
  /** Mahsulot qatori: "+" tugmasi qaysi chetda. */
  addDirection: 'row' | 'row-reverse';
  /** Mahsulot tanlanganda chap/o'ngda ikkita katta "−"/"+" zonasi chiqsinmi. */
  splitStepper: boolean;
  /** Mahsulot qatorida "−" ham (qarama-qarshi chetda) ko'rinsinmi. */
  edgeMinus: boolean;
}

export function handRules(layout: HandLayout): HandRules {
  const left = layout === 'left';
  return {
    headerDirection: left ? 'row-reverse' : 'row',
    addDirection: left ? 'row-reverse' : 'row',
    splitStepper: layout === 'both-split',
    edgeMinus: layout === 'both-edges',
  };
}

/**
 * Buyurtma olishda menyu ko'rinishi (ofitsiant o'ziga yoqqanini tanlaydi; har qurilmada alohida).
 * `list` - hozirgi (qo'lga moslash faqat shunda to'liq ishlaydi), `compact` - bir ekranda ko'proq taom,
 * `grid` - rasmli kartochkalar (2 ustun).
 */
export type MenuStyle = 'list' | 'compact' | 'grid';

export interface MenuStyleInfo {
  id: MenuStyle;
  label: string;
  hint: string;
}

export const MENU_STYLES: readonly MenuStyleInfo[] = [
  { id: 'list', label: "Ro'yxat", hint: 'Katta qatorlar, bosish oson' },
  { id: 'compact', label: 'Ixcham', hint: "Bir ekranda ko'proq taom" },
  { id: 'grid', label: 'Kartochkalar', hint: "Rasmli, 2 ustun" },
];

export const DEFAULT_MENU_STYLE: MenuStyle = 'list';

export function isMenuStyle(v: unknown): v is MenuStyle {
  return MENU_STYLES.some((m) => m.id === v);
}
