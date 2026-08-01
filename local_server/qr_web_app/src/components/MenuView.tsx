import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { som } from '../lib/format';
import { Product } from '../types';

const Thumb: React.FC<{ product: Product }> = ({ product }) => {
  const [broken, setBroken] = useState(false);
  if (product.image && !broken) {
    return <img src={product.image} alt={product.name} loading="lazy" onError={() => setBroken(true)} />;
  }
  return <span>{(product.name || '?')[0]}</span>;
};

export const MenuView: React.FC = () => {
  const { menu, menuLoading, openProduct } = useApp();
  const [cat, setCat] = useState(0);
  const category = menu[cat];

  if (menuLoading) {
    return <div className="spin">Menyu yuklanmoqda</div>;
  }
  if (!menu.length) {
    return <div className="spin">Menyu bo'sh</div>;
  }

  return (
    <>
      <div className="catbar">
        {menu.map((c, i) => (
          <button key={c.id} aria-selected={i === cat} onClick={() => setCat(i)}>{c.name}</button>
        ))}
      </div>
      <div>
        <div className="cathd">
          <h3>{category.name}</h3>
          <span className="lbl">{(category.products || []).length} ta taom</span>
        </div>
        {(category.products || []).map((p) => (
          <button
            key={p.id}
            className={`item ${p.is_available ? '' : 'item--off'}`}
            onClick={() => openProduct(p, category.name)}
          >
            <span className="thumb"><Thumb product={p} /></span>
            <span>
              <span className="item__n">{p.name}</span>
              {!p.is_available && <><br /><span className="tag-off">Tugagan</span></>}
            </span>
            <span className="item__p">{som(p.price)}<br /><span className="lbl">so'm</span></span>
          </button>
        ))}
      </div>
    </>
  );
};
