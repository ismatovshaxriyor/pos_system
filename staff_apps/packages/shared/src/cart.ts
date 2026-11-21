import { toTiyin } from './money';
import type { Decimal, Product } from './types';

/**
 * Buyurtma qoralamasi (hali serverga yuborilmagan savat). Narx faqat ko'rsatish uchun:
 * server baribir `Product.price`dan o'zi hisoblaydi (klient narxi hech qachon yuborilmaydi).
 * Hamma funksiya "toza" (immutable) - React state bilan to'g'ridan-to'g'ri ishlaydi.
 */
export interface CartLine {
  productId: number;
  name: string;
  unitPrice: Decimal;
  quantity: number;
  note: string;
}

export type Cart = readonly CartLine[];

export const emptyCart: Cart = [];

/** Bir xil mahsulot (va bir xil izoh) qayta qo'shilsa miqdori oshadi - serverdagi `add_item` qoidasi bilan bir xil. */
export function addProduct(cart: Cart, product: Pick<Product, 'id' | 'name' | 'price'>, quantity = 1, note = ''): Cart {
  const i = cart.findIndex((l) => l.productId === product.id && l.note === note);
  if (i >= 0) return cart.map((l, idx) => (idx === i ? { ...l, quantity: l.quantity + quantity } : l));
  return [...cart, { productId: product.id, name: product.name, unitPrice: product.price, quantity, note }];
}

/** `quantity <= 0` qatorni olib tashlaydi. */
export function setQuantity(cart: Cart, productId: number, note: string, quantity: number): Cart {
  if (quantity <= 0) return cart.filter((l) => !(l.productId === productId && l.note === note));
  return cart.map((l) => (l.productId === productId && l.note === note ? { ...l, quantity } : l));
}

export function cartCount(cart: Cart): number {
  return cart.reduce((n, l) => n + l.quantity, 0);
}

/** Tiyinda (butun son) - floating-point xatosiz. */
export function cartTotalTiyin(cart: Cart): number {
  return cart.reduce((sum, l) => sum + toTiyin(l.unitPrice) * l.quantity, 0);
}

/** Izoh maksimal uzunligi (serverdagi `OrderItem.note` 255 belgigacha; oshxona cheki uchun qisqa yetarli). */
export const MAX_NOTE_LENGTH = 100;

/** Ofitsiant tez-tez yozadigan izohlar: bir bosishda qo'shiladi (yozish shart emas). */
export const NOTE_PRESETS: readonly string[] = ['Achchiq emas', 'Kam tuzli', 'Piyozsiz', 'Muzsiz', 'Olib ketish', 'Tezroq'];

/** Mehmonlar sonini tanlash tugmalari. */
export const GUEST_PRESETS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10];

/**
 * Qator izohini o'zgartiradi. Qator kaliti (mahsulot + izoh) o'zgargani uchun, agar yangi izohli qator allaqachon
 * bor bo'lsa - ikkalasi bitta qatorga qo'shiladi (miqdorlari yig'iladi). Izoh bo'shlig'i olib tashlanadi.
 */
export function setLineNote(cart: Cart, productId: number, oldNote: string, newNote: string): Cart {
  const note = newNote.trim().slice(0, MAX_NOTE_LENGTH);
  if (note === oldNote) return cart;
  const line = cart.find((l) => l.productId === productId && l.note === oldNote);
  if (!line) return cart;
  const rest = cart.filter((l) => l !== line);
  const twin = rest.findIndex((l) => l.productId === productId && l.note === note);
  if (twin >= 0) return rest.map((l, i) => (i === twin ? { ...l, quantity: l.quantity + line.quantity } : l));
  return cart.map((l) => (l === line ? { ...l, note } : l));
}

/** Izohni qo'shadi/olib tashlaydi (tezkor tugma): `a; b` ko'rinishida jamlanadi, takrorlanmaydi. */
export function toggleNotePart(note: string, part: string): string {
  const parts = note.split(';').map((p) => p.trim()).filter(Boolean);
  const i = parts.findIndex((p) => p.toLowerCase() === part.toLowerCase());
  if (i >= 0) parts.splice(i, 1);
  else parts.push(part);
  return parts.join('; ').slice(0, MAX_NOTE_LENGTH);
}

/** Mahsulot bo'yicha jami miqdor (bir mahsulot turli izohli bir necha qatorda bo'lishi mumkin). */
export function productCounts(cart: Cart): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of cart) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
  return m;
}

/** Menyudagi "−": mahsulotning OXIRGI qo'shilgan qatoridan 1 ta ayiradi (0 bo'lsa qator o'chadi). */
export function decreaseProduct(cart: Cart, productId: number): Cart {
  for (let i = cart.length - 1; i >= 0; i--) {
    const l = cart[i]!;
    if (l.productId === productId) return setQuantity(cart, productId, l.note, l.quantity - 1);
  }
  return cart;
}
