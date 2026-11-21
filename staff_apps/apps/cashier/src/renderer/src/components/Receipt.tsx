import { elapsedLabel, formatMoney, orderLabel, toTiyin, type Order } from '@pos/shared';
import type { ReactNode } from 'react';

import { useNow } from '../lib/useNow';
import { Flap } from './Flap';

const METHOD: Record<string, string> = { cash: 'Naqd', card: 'Karta', other: 'Boshqa' };

/** Chek: tarkib ro'yxati (scroll shu yerda), jami/to'langan/qolgan esa doim pastda ko'rinib turadi. */
export function Receipt({ order, actions }: { order: Order; actions?: ReactNode }) {
  const now = useNow();
  const items = order.items.filter((i) => !i.is_voided);
  const payments = order.payments.filter((p) => !p.is_voided);

  return (
    <div className="receipt">
      <div className="receipt-head">
        <span className="lbl">
          {[order.waiter?.first_name, order.guest_count ? `${order.guest_count} kishi` : '', elapsedLabel(order.created_at, now)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <h2>{orderLabel(order)}</h2>
      </div>

      <div className="receipt-items">
        {items.length === 0 && <div className="muted" style={{ padding: '12px 0' }}>Mahsulot yo'q.</div>}
        {items.map((i) => (
          <div className="ri" key={i.id}>
            <span className="ri-qty">{i.quantity}×</span>
            <span className="ri-name">
              {i.product.name}
              {i.note && <small> · {i.note}</small>}
            </span>
            <span className="ri-price">{formatMoney(i.price)}</span>
          </div>
        ))}
      </div>

      {actions && <div className="rc-actions">{actions}</div>}

      <div className="receipt-totals">
        <div className="line"><span>Mahsulotlar</span><span>{formatMoney(order.total_amount)}</span></div>
        {toTiyin(order.discount_amount) > 0 && (
          <div className="line">
            <span>Chegirma{order.discount_reason ? ` · ${order.discount_reason}` : ''}</span>
            <span>− {formatMoney(order.discount_amount)}</span>
          </div>
        )}
        {toTiyin(order.service_charge) > 0 && (
          <div className="line"><span>Xizmat haqi</span><span>{formatMoney(order.service_charge)}</span></div>
        )}
        <div className="line total"><span>Jami</span><span>{formatMoney(order.final_amount)}</span></div>
        {payments.map((p) => (
          <div className="line" key={p.id}>
            <span>{METHOD[p.method] ?? p.method} to'lovi</span>
            <span>− {formatMoney(p.amount)}</span>
          </div>
        ))}
        <div className="due-block">
          <div>
            <span className="lbl">Qolgan</span>
            <div><Flap text={formatMoney(order.balance_due, false)} /></div>
          </div>
          <span className="lbl">so'm</span>
        </div>
      </div>
    </div>
  );
}
