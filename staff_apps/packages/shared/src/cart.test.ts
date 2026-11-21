import { describe, expect, it } from 'vitest';

import { addProduct, addTemplate, decreaseProduct, emptyCart, productCounts, setLineNote, toggleNotePart } from './cart';

const osh = { id: 1, name: 'Osh', price: '30000.00' };

describe('setLineNote', () => {
  it("izohni o'zgartiradi", () => {
    const c = setLineNote(addProduct(emptyCart, osh), 1, '', '  Achchiq emas ');
    expect(c).toEqual([{ productId: 1, name: 'Osh', unitPrice: '30000.00', quantity: 1, note: 'Achchiq emas' }]);
  });

  it("bir xil izohli qator bor bo'lsa birlashtiradi (miqdor yig'iladi)", () => {
    let c = addProduct(emptyCart, osh, 2, 'Piyozsiz');
    c = addProduct(c, osh, 1, '');
    const merged = setLineNote(c, 1, '', 'Piyozsiz');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ quantity: 3, note: 'Piyozsiz' });
  });

  it("yo'q qator yoki o'zgarmagan izoh - cart o'sha-o'zi", () => {
    const c = addProduct(emptyCart, osh);
    expect(setLineNote(c, 9, '', 'x')).toBe(c);
    expect(setLineNote(c, 1, '', '')).toBe(c);
  });

  it("uzun izohni qisqartiradi", () => {
    expect(setLineNote(addProduct(emptyCart, osh), 1, '', 'x'.repeat(300))[0]!.note).toHaveLength(100);
  });
});

describe('toggleNotePart', () => {
  it("qo'shadi, takroran bossa olib tashlaydi (katta-kichik harfsiz)", () => {
    let n = toggleNotePart('', 'Piyozsiz');
    expect(n).toBe('Piyozsiz');
    n = toggleNotePart(n, 'Achchiq emas');
    expect(n).toBe('Piyozsiz; Achchiq emas');
    expect(toggleNotePart(n, 'piyozsiz')).toBe('Achchiq emas');
  });
});

describe('productCounts / decreaseProduct', () => {
  it("turli izohli qatorlar yig'iladi, '−' oxirgisidan ayiradi", () => {
    let c = addProduct(emptyCart, osh, 2, '');
    c = addProduct(c, osh, 1, 'Piyozsiz');
    expect(productCounts(c).get(1)).toBe(3);
    c = decreaseProduct(c, 1); // 'Piyozsiz' qatori 0 bo'lib o'chadi
    expect(c).toEqual([expect.objectContaining({ note: '', quantity: 2 })]);
    expect(decreaseProduct(c, 99)).toBe(c);
  });
});

describe('addTemplate', () => {
  const salat = { id: 2, name: 'Salat', price: '12000.00' };
  const choy = { id: 3, name: 'Choy', price: '5000.00' };
  const tpl = {
    items: [
      { id: 1, product_id: 1, quantity: 1, note: '' },
      { id: 2, product_id: 2, quantity: 1, note: '' },
      { id: 3, product_id: 3, quantity: 2, note: 'Limonsiz' },
      { id: 4, product_id: 99, quantity: 1, note: '' },
    ],
  };

  it("savatga qo'shadi; sotuvda yo'q taomni o'tkazib yuboradi", () => {
    const r = addTemplate(emptyCart, tpl, [osh, salat, choy]);
    expect(r.added).toBe(3);
    expect(r.skipped).toBe(1);
    expect(r.cart.map((l) => [l.productId, l.quantity, l.note])).toEqual([[1, 1, ''], [2, 1, ''], [3, 2, 'Limonsiz']]);
  });

  it("mavjud miqdorga qo'shiladi (ikki marta bossa ikki baravar)", () => {
    const once = addTemplate(addProduct(emptyCart, osh, 1), tpl, [osh, salat, choy]).cart;
    expect(once.find((l) => l.productId === 1)!.quantity).toBe(2);
    const twice = addTemplate(once, tpl, [osh, salat, choy]).cart;
    expect(twice.find((l) => l.productId === 1)!.quantity).toBe(3);
    expect(twice.find((l) => l.productId === 3)!.quantity).toBe(4);
  });

  it("bo'sh shablon cart'ni o'zgartirmaydi", () => {
    expect(addTemplate(emptyCart, { items: [] }, [osh]).cart).toBe(emptyCart);
  });
});
