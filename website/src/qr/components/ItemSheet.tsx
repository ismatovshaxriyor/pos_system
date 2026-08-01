import React from 'react';
import { useApp } from '../context/AppContext';
import { som } from '../../lib/format';

export const ItemSheet: React.FC = () => {
  const { selectedProduct, closeProduct } = useApp();
  const open = !!selectedProduct;

  return (
    <div className="sheet" data-open={open || undefined} role="dialog" aria-modal="true" aria-label="Taom tafsiloti">
      <div className="sheet__hd">
        <span className="lbl">Taom tafsiloti</span>
        <button className="btn btn--sm" onClick={closeProduct}>Yopish</button>
      </div>
      {selectedProduct && (
        <div className="sheet__body">
          <div className="hero-img">
            {selectedProduct.product.image
              ? <img src={selectedProduct.product.image} alt={selectedProduct.product.name} />
              : <span>{(selectedProduct.product.name || '?')[0]}</span>}
          </div>
          <div className="sheet__n">{selectedProduct.product.name}</div>
          <div className="kv">
            <div className="kv__r"><span>Narx</span><span>{som(selectedProduct.product.price)}&nbsp;so'm</span></div>
            <div className="kv__r">
              <span>Holat</span>
              <span style={{ color: selectedProduct.product.is_available ? 'var(--ok)' : 'var(--ink-40)' }}>
                {selectedProduct.product.is_available ? 'Mavjud' : 'Tugagan'}
              </span>
            </div>
            <div className="kv__r"><span>Kategoriya</span><span>{selectedProduct.categoryName}</span></div>
            {selectedProduct.product.barcode && (
              <div className="kv__r"><span>Shtrix-kod</span><span>{selectedProduct.product.barcode}</span></div>
            )}
            <div className="kv__r"><span>Kod</span><span>#{selectedProduct.product.id}</span></div>
          </div>
          <div className="note" style={{ marginBottom: 24 }}>
            Buyurtma berish uchun ofitsiantga murojaat qiling.
          </div>
        </div>
      )}
    </div>
  );
};
