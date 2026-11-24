/**
 * Asosiy ekran ustunlari kengligi (buyurtmalar / to'lov). Chek ustuni qolgan joyni egallaydi.
 * Terminalning shaxsiy sozlamasi: localStorage'da saqlanadi, serverga yuborilmaydi.
 */
export interface Columns {
  orders: number;
  pay: number;
}

export const COL_DEFAULT: Columns = { orders: 330, pay: 440 };
/** Eng kichik kenglik: undan torroq bo'lsa tugma/summalar sig'maydi. */
export const COL_MIN: Columns = { orders: 240, pay: 360 };
/** Chek ustuni kamida shuncha joy olsin (qolgani ikki ustunga beriladi). */
export const RECEIPT_MIN = 340;

const KEY = 'pos.cashier.columns.v1';

function clampTo(cols: Columns, total: number): Columns {
  // total - ishchi maydon kengligi. Ikki ustun yig'indisi (total - RECEIPT_MIN) dan oshmasin.
  const room = Math.max(total - RECEIPT_MIN, COL_MIN.orders + COL_MIN.pay);
  let orders = Math.max(COL_MIN.orders, Math.round(cols.orders));
  let pay = Math.max(COL_MIN.pay, Math.round(cols.pay));
  if (orders + pay > room) {
    // Ortiqchani ikkala ustundan, minimumdan pastga tushirmasdan olib tashlaymiz.
    let over = orders + pay - room;
    const cutPay = Math.min(pay - COL_MIN.pay, Math.ceil(over / 2));
    pay -= cutPay;
    over -= cutPay;
    const cutOrders = Math.min(orders - COL_MIN.orders, over);
    orders -= cutOrders;
    over -= cutOrders;
    pay -= Math.min(pay - COL_MIN.pay, over);
  }
  return { orders, pay };
}

function read(): Columns {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return COL_DEFAULT;
    const p = JSON.parse(raw) as Partial<Columns>;
    const orders = Number(p.orders);
    const pay = Number(p.pay);
    return {
      orders: Number.isFinite(orders) ? orders : COL_DEFAULT.orders,
      pay: Number.isFinite(pay) ? pay : COL_DEFAULT.pay,
    };
  } catch {
    return COL_DEFAULT;
  }
}

let cols: Columns = read();

export function getColumns(): Columns {
  return cols;
}

/** CSS o'zgaruvchilarini yozadi (`--w-orders`, `--w-pay`). */
export function applyColumns(total?: number): void {
  if (total && total > 0) cols = clampTo(cols, total);
  const root = document.documentElement;
  root.style.setProperty('--w-orders', `${cols.orders}px`);
  root.style.setProperty('--w-pay', `${cols.pay}px`);
}

export function setColumn(which: keyof Columns, width: number, total: number): void {
  cols = clampTo({ ...cols, [which]: width }, total);
  applyColumns();
}

export function saveColumns(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cols));
  } catch {
    // Saqlab bo'lmasa ham joriy sessiyada ishlaydi.
  }
}

/** Ustun uchun ruxsat etilgan eng katta kenglik (chek ustuni RECEIPT_MIN dan torayib ketmasin). */
export function maxWidth(which: keyof Columns, total: number): number {
  const other = which === 'orders' ? cols.pay : cols.orders;
  return Math.max(COL_MIN[which], total - RECEIPT_MIN - other);
}
