import type { PosApi } from './api';
import type { Cart } from './cart';

export interface DraftOrder {
  /**
   * Qoralama ochilganda BIR MARTA yaratiladi va qayta urinishlarda o'zgarmaydi: javob
   * yo'qolib qayta yuborilsa server mavjud buyurtmani qaytaradi (dublikat ochilmaydi).
   */
  syncUuid: string;
  tableId: number | null;
  guestCount?: number;
  note?: string;
  lines: Cart;
}

/** Qayta urinishda qaysi qadamlar allaqachon bajarilganini eslab qoladi (o'zgaruvchan obyekt - useRef'da saqlang). */
export interface SubmitProgress {
  orderId?: number;
  itemsAdded?: boolean;
}

/**
 * Qoralamani serverga yuboradi: `create` → `add_item` → `start` (oshxonaga chek).
 * Bu uch alohida so'rov, shuning uchun WiFi o'rtada uzilishi mumkin. Har qadam `progress`ga
 * yoziladi va qayta chaqirilganda faqat bajarilmagan qadamlar takrorlanadi:
 *  - `create` - `syncUuid` tufayli idempotent;
 *  - `add_item` - miqdorlarni QO'SHADI (merge), shuning uchun `itemsAdded` bilan ikki marta yuborilmaydi;
 *  - `start` - faqat buyurtma hali `new` bo'lsa (javob yo'qolgan bo'lsa u allaqachon `in_progress`).
 * @returns buyurtma ID'si
 */
export async function submitDraft(api: PosApi, draft: DraftOrder, progress: SubmitProgress = {}): Promise<number> {
  if (draft.lines.length === 0) throw new Error("Savat bo'sh.");

  if (progress.orderId === undefined) {
    const order = await api.orders.create({
      sync_uuid: draft.syncUuid,
      table_id: draft.tableId,
      order_type: 'dine_in',
      guest_count: draft.guestCount,
      note: draft.note,
    });
    progress.orderId = order.id;
  }
  const orderId = progress.orderId;

  if (!progress.itemsAdded) {
    await api.orders.addItem(
      orderId,
      draft.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, note: l.note })),
    );
    progress.itemsAdded = true;
  }

  const current = await api.orders.get(orderId);
  if (current.status === 'new') await api.orders.start(orderId);
  return orderId;
}
