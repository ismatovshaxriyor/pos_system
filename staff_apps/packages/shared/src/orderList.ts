import { fullName } from './roles';
import type { Order } from './types';

/** Ochiq buyurtmalar: eng eskisi birinchi (kutib qolgan mijoz tepada). Asl massiv o'zgarmaydi. */
export function sortOpenOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/**
 * Qidiruv: stol nomi, ofitsiant ismi/familiyasi yoki buyurtma raqami bo'yicha (katta-kichik harf farqsiz,
 * bo'shliq bilan ajratilgan bir nechta so'z - hammasi mos kelishi kerak). Bo'sh so'rov - hammasi.
 */
export function filterOrders(orders: Order[], query: string): Order[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return orders;
  return orders.filter((o) => {
    const hay = [o.table?.name, fullName(o.waiter), String(o.id), `#${o.id}`].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** `delta` (+1/-1) qadam bilan keyingi/oldingi buyurtma id'si; tanlov yo'q yoki ro'yxatdan tashqarida bo'lsa - chetdagisi. */
export function stepSelection(orders: Order[], currentId: number | null, delta: 1 | -1): number | null {
  if (orders.length === 0) return null;
  const idx = orders.findIndex((o) => o.id === currentId);
  if (idx === -1) return orders[delta === 1 ? 0 : orders.length - 1]!.id;
  const next = Math.min(orders.length - 1, Math.max(0, idx + delta));
  return orders[next]!.id;
}
