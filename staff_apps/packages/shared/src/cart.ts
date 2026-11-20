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
