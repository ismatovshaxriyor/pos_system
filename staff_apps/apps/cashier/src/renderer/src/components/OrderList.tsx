import { elapsedLabel, formatMoney, toTiyin, type Order } from '@pos/shared';

import { useNow } from '../lib/useNow';

const STATUS: Record<string, string> = { new: 'Yangi', in_progress: 'Jarayonda' };

/** Shundan ko'p kutgan buyurtma sariq chiziq + sariq vaqt belgisi bilan ajraladi. */
export const LATE_AFTER_MS = 45 * 60_000;

/** Ochiq buyurtmalar: eng eskisi tepada (kutib qolgan mijoz birinchi). */
export function OrderList({ orders, selectedId, onSelect }: { orders: Order[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const now = useNow();
  const sorted = [...orders].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  if (sorted.length === 0) return <div className="orders-empty muted">Hozircha ochiq buyurtma yo'q</div>;

  return (
    <>
      {sorted.map((o) => {
        const paid = toTiyin(o.amount_paid) > 0;
        const late = now - Date.parse(o.created_at) >= LATE_AFTER_MS;
        const cls = ['order-tile', selectedId === o.id ? 'active' : '', late ? 'late' : '', paid ? 'partial' : ''].filter(Boolean).join(' ');
        return (
          <button key={o.id} className={cls} onClick={() => onSelect(o.id)}>
            <span className="ot-top">
              <span className="ot-name">{o.table?.name ?? `#${o.id}`}</span>
              <span className="ot-time">{elapsedLabel(o.created_at, now)}</span>
            </span>
            <span className="ot-mid">
              {o.waiter && <i className="av" aria-hidden="true">{o.waiter.first_name.charAt(0)}</i>}
              {[o.waiter?.first_name, STATUS[o.status] ?? o.status].filter(Boolean).join(' · ')}
            </span>
            <span className="ot-amount">
              {formatMoney(o.balance_due)}
              {paid && <small>qisman</small>}
            </span>
          </button>
        );
      })}
    </>
  );
}
