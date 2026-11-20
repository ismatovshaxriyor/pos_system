import { describe, expect, it, vi } from 'vitest';
import type { PosApi } from './api';
import { addProduct, cartCount, cartTotalTiyin, emptyCart, setQuantity } from './cart';
import { submitDraft, type DraftOrder, type SubmitProgress } from './submit-order';

const plov = { id: 1, name: 'Osh', price: '45000.00' };
const cola = { id: 2, name: 'Cola', price: '9000.50' };

describe('cart', () => {
  it('bir xil mahsulot qoʼshilsa miqdor oshadi, izohi boshqa boʼlsa alohida qator', () => {
    let c = addProduct(emptyCart, plov);
    c = addProduct(c, plov);
    c = addProduct(c, plov, 1, 'achchiq');
    expect(c).toHaveLength(2);
    expect(cartCount(c)).toBe(3);
  });

  it('jami tiyinda, floating-point xatosiz', () => {
    let c = addProduct(emptyCart, cola, 3); // 3 × 9000.50
    c = addProduct(c, plov);
    expect(cartTotalTiyin(c)).toBe(3 * 900_050 + 4_500_000);
  });

  it('miqdor 0 boʼlsa qator oʼchadi', () => {
    const c = setQuantity(addProduct(emptyCart, plov, 2), 1, '', 0);
    expect(c).toHaveLength(0);
  });
});

function fakeApi(opts: { failAddItemOnce?: boolean; startedAlready?: boolean } = {}) {
  let status: 'new' | 'in_progress' = opts.startedAlready ? 'in_progress' : 'new';
  let addFailures = opts.failAddItemOnce ? 1 : 0;
  const orders = {
    create: vi.fn(async () => ({ id: 77 })),
    addItem: vi.fn(async () => {
      if (addFailures-- > 0) throw new Error('network');
      return { status: 'Item added' };
    }),
    get: vi.fn(async () => ({ id: 77, status })),
    start: vi.fn(async () => {
      status = 'in_progress';
      return { status: 'Order started' };
    }),
  };
  return { api: { orders } as unknown as PosApi, orders };
}

const draft = (): DraftOrder => ({
  syncUuid: 'uuid-1',
  tableId: 5,
  lines: addProduct(addProduct(emptyCart, plov, 2), cola),
});

describe('submitDraft', () => {
  it('create → add_item → start tartibida bajaradi va sync_uuid yuboradi', async () => {
    const { api, orders } = fakeApi();
    const id = await submitDraft(api, draft());
    expect(id).toBe(77);
    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ sync_uuid: 'uuid-1', table_id: 5 }));
    expect(orders.addItem).toHaveBeenCalledWith(77, [
      { product_id: 1, quantity: 2, note: '' },
      { product_id: 2, quantity: 1, note: '' },
    ]);
    expect(orders.start).toHaveBeenCalledTimes(1);
  });

  it('add_item yiqilsa, qayta urinishda buyurtma qayta yaratilmaydi, mahsulotlar ikki marta qoʼshilmaydi', async () => {
    const { api, orders } = fakeApi({ failAddItemOnce: true });
    const progress: SubmitProgress = {};
    await expect(submitDraft(api, draft(), progress)).rejects.toThrow('network');
    expect(progress).toEqual({ orderId: 77 });

    await submitDraft(api, draft(), progress);
    expect(orders.create).toHaveBeenCalledTimes(1);
    expect(orders.addItem).toHaveBeenCalledTimes(2); // 1 xato + 1 muvaffaqiyatli
    expect(orders.start).toHaveBeenCalledTimes(1);
  });

  it('start javobi yoʼqolgan boʼlsa (buyurtma allaqachon in_progress) qayta start qilmaydi', async () => {
    const { api, orders } = fakeApi({ startedAlready: true });
    await submitDraft(api, draft(), { orderId: 77, itemsAdded: true });
    expect(orders.start).not.toHaveBeenCalled();
    expect(orders.addItem).not.toHaveBeenCalled();
  });

  it('boʼsh savatni yubormaydi', async () => {
    const { api, orders } = fakeApi();
    await expect(submitDraft(api, { ...draft(), lines: emptyCart })).rejects.toThrow("Savat bo'sh");
    expect(orders.create).not.toHaveBeenCalled();
  });
});
