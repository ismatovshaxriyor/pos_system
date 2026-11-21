import {
  customerName,
  describeError,
  formatMoney,
  orderLabel,
  orderTitle,
  tiyinToDecimal,
  toTiyin,
  type ApiError,
  type Customer,
  type Order,
  type PaymentMethod,
  type PaymentPlan,
} from '@pos/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useRealtimeRefresh, useSession } from '../lib/hooks';
import { pos } from '../lib/pos';
import { playPaid } from '../lib/sound';
import { CreditSheet } from './CreditSheet';
import { DiscountSheet } from './DiscountSheet';
import { Flap } from './Flap';
import { PayPanel } from './PayPanel';
import { Receipt } from './Receipt';

const REFRESH = ['order_updated'] as const;
/** Real-time zaxirasi: ochiq chek shu oraliqda serverdan qayta o'qiladi. */
const POLL_MS = 15_000;

interface Done {
  table: string;
  paid: number;
  change: number;
  /** Qarzga yozilgan bo'lsa - mijoz ismi (to'lov emas, nasiya). */
  credit?: string;
}

/** Tanlangan buyurtma: chek + to'lov paneli. To'lov to'liq bo'lsa buyurtma o'zi yopiladi. */
export function Workspace({
  orderId,
  onChanged,
  onClose,
  onCancelled,
}: {
  orderId: number;
  onChanged: () => void;
  onClose: () => void;
  /** Buyurtma boshqa joyda (masalan menejer telefonidan) bekor qilindi: ekran bosh sahifaga qaytishi va xabar ko'rsatishi uchun. */
  onCancelled?: (label: string) => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [sheet, setSheet] = useState<'credit' | 'discount' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { user } = useSession();
  const cancelNotified = useRef(false);
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;

  const load = useCallback(async () => {
    try {
      const fresh = await pos.api.orders.get(orderId);
      setOrder(fresh);
      if (fresh.status === 'cancelled' && !cancelNotified.current) {
        cancelNotified.current = true;
        onCancelledRef.current?.(orderTitle(fresh));
      }
      return fresh;
    } catch (e) {
      setError(describeError(e));
      return null;
    }
  }, [orderId]);

  useEffect(() => {
    setOrder(null);
    setError(null);
    setDone(null);
    void load();
  }, [load]);
  useRealtimeRefresh(REFRESH, load);

  // Himoya: WebSocket uzilib qolsa (zombi ulanish, server qayta ishga tushishi) ham ochiq chek eskirib turmasin -
  // bekor qilingan/boshqa terminalda yopilgan buyurtma o'zi yangilansin.
  const stale = useRef({ busy: false, finished: false });
  stale.current = { busy, finished: order?.status === 'completed' || order?.status === 'cancelled' };
  useEffect(() => {
    const t = setInterval(() => {
      if (!stale.current.busy && !stale.current.finished) void load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // "To'landi" oynasi o'zi yopiladi.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [done, onClose]);

  async function pay(plan: Extract<PaymentPlan, { ok: true }>, method: PaymentMethod) {
    if (!order || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pos.api.orders.addPayment(orderId, { amount: tiyinToDecimal(plan.payTiyin), method });
    } catch (e) {
      // Pul bilan bog'liq: javob yo'qolgan bo'lishi mumkin - to'lov o'tgan-o'tmaganini serverdan qayta o'qiymiz,
      // kassir haqiqiy qoldiqni ko'rib, ikki marta olib yubormasin.
      await load();
      const net = (e as ApiError).isNetwork;
      setError(
        net
          ? "Tarmoq xatosi. To'lov o'tgan-o'tmaganini tekshiring - qolgan summa yangilandi, keyin qayta urinib ko'ring."
          : describeError(e),
      );
      setBusy(false);
      return;
    }

    const fresh = await load();
    onChanged();
    if (fresh && toTiyin(fresh.balance_due) === 0 && fresh.status !== 'completed') {
      try {
        await pos.api.orders.close(orderId);
        await load();
        onChanged();
        setDone({ table: orderTitle(fresh), paid: toTiyin(fresh.final_amount), change: plan.changeTiyin });
        playPaid();
      } catch (e) {
        setError(`To'lov qabul qilindi, lekin buyurtmani yopib bo'lmadi: ${describeError(e)}`);
      }
    }
    setBusy(false);
  }

  /** Qarzga yozish tugadi: buyurtma serverda yopilgan - yangilab, "Qarzga yozildi" oynasini ko'rsatamiz. */
  async function onCredited(customer: Customer) {
    setSheet(null);
    const was = order;
    await load();
    onChanged();
    setDone({
      table: was ? orderTitle(was) : `#${orderId}`,
      paid: was ? toTiyin(was.balance_due) : 0,
      change: 0,
      credit: customerName(customer),
    });
  }

  async function printBill() {
    setError(null);
    try {
      await pos.api.orders.printPreBill(orderId);
      setNotice('Hisob chop etishga yuborildi');
      setTimeout(() => setNotice(null), 3000);
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function closeOnly() {
    setBusy(true);
    setError(null);
    try {
      await pos.api.orders.close(orderId);
      await load();
      onChanged();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <div className="panel-empty muted">{error ?? 'Yuklanmoqda...'}</div>;

  const due = toTiyin(order.balance_due);
  const finished = order.status === 'completed' || order.status === 'cancelled';

  return (
    <>
      <section className="col-receipt">
        <Receipt
          order={order}
          actions={
            finished ? null : (
              <>
                {user?.role === 'manager' && (
                  <button className="btn ghost" onClick={() => setSheet('discount')} disabled={busy}>Chegirma</button>
                )}
                {due > 0 && (
                  <button className="btn ghost" onClick={() => setSheet('credit')} disabled={busy}>Qarzga yozish</button>
                )}
                <button className="btn ghost" onClick={() => void printBill()} disabled={busy}>Hisob</button>
                {notice && <span className="lbl rc-note">{notice}</span>}
              </>
            )
          }
        />
      </section>
      <section className="col-pay">
        {finished ? (
          <div className="panel-empty muted">Buyurtma {order.status === 'completed' ? 'yopilgan' : 'bekor qilingan'}.</div>
        ) : due === 0 ? (
          // Odatda bu holat ko'rinmaydi (avto-yopish). Yopish xato bergan bo'lsa - qayta urinish.
          <div className="pay">
            {error && <div className="error">{error}</div>}
            <button className="btn go solo" onClick={() => void closeOnly()} disabled={busy}>Buyurtmani yopish</button>
          </div>
        ) : (
          <PayPanel order={order} busy={busy} error={error} onPay={(p, m) => void pay(p, m)} onClose={onClose} />
        )}
      </section>

      {sheet === 'credit' && <CreditSheet order={order} onClose={() => setSheet(null)} onDone={(c) => void onCredited(c)} />}
      {sheet === 'discount' && (
        <DiscountSheet
          order={order}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            void load();
            onChanged();
          }}
        />
      )}

      {done && (
        <div className="overlay success" onClick={onClose}>
          <div className="sheet">
            <div className="sheet-bar">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
              <h2>{done.credit ? 'Qarzga yozildi' : "To'landi"}</h2>
            </div>
            <div className="sheet-body">
              <span className="lbl">
                {done.table} · {formatMoney(tiyinToDecimal(done.paid))}
                {done.credit ? ` · ${done.credit}` : ''}
              </span>
              {done.change > 0 && (
                <>
                  <span className="lbl" style={{ marginTop: 14 }}>Mijozga qaytim</span>
                  <div><Flap tone="ok" text={formatMoney(tiyinToDecimal(done.change), false)} /></div>
                </>
              )}
              <button className="btn go solo" onClick={onClose}>Keyingi buyurtma</button>
              <span className="lbl hint">Oyna 6 soniyadan keyin o'zi yopiladi</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
