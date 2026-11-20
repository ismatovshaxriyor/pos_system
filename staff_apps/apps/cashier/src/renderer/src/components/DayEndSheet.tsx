import { dayEndText, describeError, formatMoney, toTiyin, type DayEndReport } from '@pos/shared';
import { useCallback, useEffect, useState } from 'react';

import { pos } from '../lib/pos';

const METHODS: { id: 'cash' | 'card' | 'other'; label: string }[] = [
  { id: 'cash', label: 'Naqd' },
  { id: 'card', label: 'Karta' },
  { id: 'other', label: 'Boshqa' },
];

function time(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`de-row${strong ? ' strong' : ''}`}>
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

/**
 * Kun yakuni: faqat BUGUNGI savdo (o'tgan kunlar menejerning hisobotida). Kassani yopishdan oldin
 * qarash uchun: tushum, usullar bo'yicha, kassadagi naqd (sanash uchun), nasiya, bekorlar va hali
 * yopilmagan buyurtmalar. "Nusxa olish" - matnni xabar sifatida yuborish uchun.
 */
export function DayEndSheet({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<DayEndReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await pos.api.reports.dayEnd());
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(dayEndText(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Nusxa olib bo'lmadi.");
    }
  }

  const r = report;
  const has = (v: string) => toTiyin(v) > 0;
  const v = r?.voids;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-bar plain">
          <h2>Kun yakuni</h2>
        </div>
        <div className="sheet-body">
          {error && <div className="error">{error}</div>}
          {!r && !error && <div className="muted">Yuklanmoqda...</div>}

          {r && (
            <>
              <span className="lbl">
                Bugun · {r.register.is_open ? 'kassa ochiq' : `kassa ${time(r.register.closed_at)} da yopilgan`} · shakllandi {time(r.generated_at)}
              </span>

              {r.open_orders.count > 0 && (
                <div className="de-warn">
                  <strong>{r.open_orders.count} ta buyurtma hali yopilmagan</strong>
                  <div className="de-open">
                    {r.open_orders.items.map((o) => (
                      <span key={o.id}>
                        {o.table ?? `#${o.id}`} · {formatMoney(o.total)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="display">
                <div className="display-label">Bugungi tushum</div>
                <div className="display-amount">
                  {formatMoney(r.revenue.total, false)}
                  <span className="lbl">soʼm</span>
                </div>
                <div className="display-sub">
                  <span>{r.revenue.order_count} ta buyurtma</span>
                  <span className="val">o'rtacha {formatMoney(r.revenue.avg_check)}</span>
                </div>
              </div>

              <div className="de-card">
                <span className="lbl">To'lov usullari</span>
                {METHODS.map((m) => (
                  <Row key={m.id} label={m.label} value={formatMoney(r.revenue.by_method[m.id])} />
                ))}
                {has(r.revenue.discount_total) && <Row label="Berilgan chegirmalar" value={formatMoney(r.revenue.discount_total)} />}
              </div>

              <div className="de-card cash">
                <span className="lbl">Kassadagi naqd pul (sanash uchun)</span>
                <div className="de-cash mono">{formatMoney(r.cash.expected)}</div>
                <Row label="Naqd savdo" value={formatMoney(r.cash.sales)} />
                {has(r.cash.debt_repayments) && <Row label="Naqd qaytarilgan qarz" value={formatMoney(r.cash.debt_repayments)} />}
              </div>

              {(has(r.debts.credit_sales) || has(r.debts.repayments)) && (
                <div className="de-card">
                  <span className="lbl">Nasiya</span>
                  <Row label="Nasiyaga berildi" value={formatMoney(r.debts.credit_sales)} />
                  <Row label="Qaytarildi (barcha usul)" value={formatMoney(r.debts.repayments)} />
                </div>
              )}

              {v && (v.cancelled_orders > 0 || v.voided_items > 0 || v.voided_payments > 0) && (
                <div className="de-card">
                  <span className="lbl">Bekor qilinganlar</span>
                  {v.cancelled_orders > 0 && <Row label="Buyurtmalar" value={`${v.cancelled_orders} ta`} />}
                  {v.voided_items > 0 && <Row label="Taomlar" value={`${v.voided_items} ta`} />}
                  {v.voided_payments > 0 && (
                    <Row label="To'lovlar" value={`${v.voided_payments} ta · ${formatMoney(v.voided_payments_total)}`} />
                  )}
                </div>
              )}
            </>
          )}

          <div className="confirm-row">
            <button className="btn ghost" onClick={() => void load()}>Yangilash</button>
            <button className="btn ghost" onClick={() => void copy()} disabled={!r}>
              {copied ? 'Nusxalandi' : 'Nusxa olish'}
            </button>
          </div>
          <button className="btn ink" onClick={onClose}>Yopish</button>
        </div>
      </div>
    </div>
  );
}
