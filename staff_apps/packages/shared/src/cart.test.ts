import { describe, expect, it } from 'vitest';

import { addProduct, decreaseProduct, emptyCart, productCounts, setLineNote, toggleNotePart } from './cart';

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
