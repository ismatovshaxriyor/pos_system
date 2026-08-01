import React from 'react';
import { useApp } from '../context/AppContext';
import { num, som, clock } from '../../lib/format';
import { OrderItemStatus, OrderType } from '../types';

const ORDER_TYPE: Record<OrderType, string> = {
  dine_in: 'Stolga',
  takeaway: 'Olib ketish',
  delivery: 'Yetkazib berish',
};

const ITEM_ST: Record<OrderItemStatus, [string, string]> = {
  new: ['Yangi', 'new'],
  in_progress: ['Tayyorlanmoqda', 'new'],
  ready: ['Tayyor', 'ready'],
  served: ['Berildi', 'ready'],
  cancelled: ['Bekor', 'closed'],
};

export const BillView: React.FC = () => {
  const { table, tableLoading } = useApp();

  if (tableLoading && !table) {
    return <div className="spin">Yuklanmoqda</div>;
  }
  if (!table) {
    return <div className="spin">Yuklanmoqda</div>;
  }

  const label = table.zone_name ? `${table.table_name} (${table.zone_name})` : table.table_name;
  const order = table.current_order;

  if (!order) {
    return (
      <>
        <div className="billhd">
          <span className="lbl">Stol</span>
          <div className="billhd__r"><h3 className="billhd__t">{label}</h3></div>
        </div>
        <div className="empty">
          <div className="empty__l" />
          <div className="empty__t">Hali buyurtma<br />ochilmagan</div>
          <p className="lede" style={{ fontSize: 14, margin: '0 auto' }}>
            Bu stolda ochiq hisob yo'q. Buyurtma berish uchun ofitsiantni chaqiring — hisob ochilgach shu yerda jonli ko'rinadi.
          </p>
        </div>
      </>
    );
  }

  const disc = num(order.discount_amount);
  const tax = num(order.tax_amount);
  const srv = num(order.service_charge);

  return (
    <>
      <div className="billhd">
        <span className="lbl">Stol</span>
        <div className="billhd__r">
          <h3 className="billhd__t">{label}</h3>
          <span className="stpill">Ochiq</span>
        </div>
        <div className="lic__rows" style={{ marginTop: 12, borderTop: 'var(--hair)' }}>
          <div className="sum"><span>Buyurtma</span><b>#{order.id}</b></div>
          <div className="sum"><span>Turi</span><b>{ORDER_TYPE[order.order_type] || order.order_type}</b></div>
          <div className="sum" style={{ borderBottom: 0 }}><span>Ochilgan</span><b>{clock(order.created_at)}</b></div>
        </div>
      </div>
      <div className="cathd" style={{ paddingTop: 16 }}>
        <h3>Pozitsiyalar</h3>
        <span className="lbl">{order.items.length} ta</span>
      </div>
      {order.items.map((it) => {
        const st = ITEM_ST[it.status] || ['—', 'closed'];
        return (
          <div key={it.id} className={`brow brow--${st[1]}`}>
            <div>
              <div className="brow__n">{it.product_name}</div>
              <div className="brow__m">{som(it.price)} × {it.quantity} · {st[0]}</div>
            </div>
            <div className="brow__s">{som(num(it.price) * it.quantity)}</div>
          </div>
        );
      })}
      <div className="sums" style={{ marginTop: 14 }}>
        <div className="sum"><span>Oraliq jami</span><b>{som(order.total_amount)}</b></div>
        {!!srv && <div className="sum"><span>Xizmat haqi {table.service_charge_rate || ''}%</span><b>{som(srv)}</b></div>}
        {!!tax && <div className="sum"><span>Soliq</span><b>{som(tax)}</b></div>}
        {!!disc && <div className="sum"><span>Chegirma</span><b>−{som(disc)}</b></div>}
      </div>
      <div className="final">
        <div>
          <span className="lbl">Yakuniy summa</span>
          <split-flap mode="num" text={som(order.final_amount)} pad={9} step={48}></split-flap>
        </div>
        <span className="lbl" style={{ paddingBottom: 6 }}>so'm</span>
      </div>
      <div className="note">Hisobni yopish uchun ofitsiant yoki kassirga murojaat qiling.</div>
    </>
  );
};
