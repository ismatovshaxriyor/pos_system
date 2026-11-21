import {
  checkRepayment,
  customerName,
  describeError,
  enteredTiyin,
  formatMoney,
  isOverdue,
  popDigit,
  pushDigit,
  tiyinToDecimal,
  toTiyin,
  type Customer,
  type DebtTransaction,
  type PaymentMethod,
} from '@pos/shared';
import { useCallback, useEffect, useState } from 'react';

import { useRealtimeRefresh } from '../lib/hooks';
import { pos } from '../lib/pos';

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];
const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Naqd' },
  { id: 'card', label: 'Karta' },
  { id: 'other', label: 'Boshqa' },
];

/**
 * Qarzdorlar: mijozning nasiyasini qaytarib olish. Ro'yxat (qarzi borlar) → mijoz → summa + usul → qabul.
 * To'lov qarzdan oshmaydi (server ham tekshiradi); "Hammasi" tugmasi butun qarzni yopadi.
 */
export function DebtSheet({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Customer[] | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Boshqa qurilmada qarz/to'lov o'zgarsa ro'yxat darrov yangilanadi.
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  useRealtimeRefresh(['customers_changed'], bump);

  useEffect(() => {
    if (selected) return;
    let alive = true;
    const t = setTimeout(() => {
      pos.api.customers
        .list({ has_debt: true, search: query.trim() })
        .then((r) => alive && setList(r.results))
        .catch((e) => alive && setError(describeError(e)));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, selected, tick]);

  const totalDebt = (list ?? []).reduce((s, c) => s + toTiyin(c.balance), 0);

  return (
    <div className="overlay" onClick={onClose}>
      <div className={`sheet wide${selected ? ' xl' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-bar plain">
          <h2>Qarzdorlar</h2>
        </div>
        <div className="sheet-body">
          {selected ? (
            <Repay
              customer={selected}
              onBack={() => setSelected(null)}
              onChanged={(c) => setSelected(c)}
            />
          ) : (
            <>
              <div className="field">
                <label htmlFor="d-search">Mijoz</label>
                <input id="d-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ism yoki telefon bo'yicha qidirish" autoFocus />
              </div>
              {list && list.length > 0 && <span className="lbl">Jami qarz: {formatMoney(tiyinToDecimal(totalDebt))} · {list.length} ta mijoz</span>}
              <div className="cust-list tall">
                {list === null && <div className="muted">Yuklanmoqda...</div>}
                {list?.length === 0 && <div className="muted">Qarzdor mijoz yo'q.</div>}
                {list?.map((c) => (
                  <button key={c.id} className="cust-row" onClick={() => setSelected(c)}>
                    <span>
                      <span className="cust-name">{customerName(c)}</span>
                      <span className="lbl">{c.phone || 'Telefon yoʼq'}</span>
                    </span>
                    <span className="ot-time">{formatMoney(c.balance)}</span>
                  </button>
                ))}
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn ghost" onClick={onClose}>Yopish</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Repay({ customer, onBack, onChanged }: { customer: Customer; onBack: () => void; onChanged: (c: Customer) => void }) {
  const [input, setInput] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [txns, setTxns] = useState<DebtTransaction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const balance = toTiyin(customer.balance);
  const amount = enteredTiyin(input);
  const check = input === '' ? { ok: false as const, reason: '' } : checkRepayment(amount, balance);

  const loadTxns = useCallback(() => {
    pos.api.customers.transactions(customer.id).then(setTxns).catch(() => setTxns([]));
  }, [customer.id]);
  useEffect(loadTxns, [loadTxns]);
  useRealtimeRefresh(['customers_changed'], loadTxns);

  async function submit() {
    if (busy || !check.ok) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await pos.api.customers.repay(customer.id, { amount: tiyinToDecimal(amount), method });
      setInput('');
      setOkMsg(`${formatMoney(tiyinToDecimal(amount))} qabul qilindi`);
      onChanged(updated);
      loadTxns();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const paid = balance === 0;
  const recent = (txns ?? []).slice(0, 2);

  const header = (
    <>
      <div className="cust-card">
        <div>
          <div className="cust-name">{customerName(customer)}</div>
          <div className="lbl">{customer.phone || 'Telefon yoʼq'}</div>
        </div>
        <button className="linkbtn" onClick={onBack} disabled={busy}>← Ro'yxat</button>
      </div>

      <div className="credit-sum">
        <span className="lbl">Qarzi</span>
        <span className="mono big">{formatMoney(customer.balance)}</span>
      </div>

      {recent.length > 0 && (
        <div className="txn-list">
          {recent.map((t) => (
            <div key={t.id} className="txn">
              <span className="lbl">
                {t.txn_type === 'repayment' ? 'To‘landi' : t.txn_type === 'credit_sale' ? 'Nasiya' : 'Tuzatish'}
                {t.order ? ` · #${t.order}` : ''}
                {t.due_date ? ` · muddat ${t.due_date}` : ''}
              </span>
              <span className={`mono ${isOverdue(t.due_date) && t.txn_type === 'credit_sale' && !paid ? 'late-txt' : ''}`}>{formatMoney(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (paid) {
    return (
      <>
        {header}
        {okMsg && <div className="ok-note">{okMsg}</div>}
        <div className="muted">Qarz to'liq yopildi.</div>
        <button className="btn ink" onClick={onBack}>Ro'yxatga qaytish</button>
      </>
    );
  }

  return (
    <div className="repay-grid">
      <div className="rg-col">
        {header}
        <div className="tabs">
          {METHODS.map((m) => (
            <button key={m.id} data-m={m.id} className={method === m.id ? 'active' : ''} onClick={() => setMethod(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="display">
          <div className="display-label">Qabul qilinadi</div>
          <div className={`display-amount ${input === '' ? 'placeholder' : ''}`}>
            {formatMoney(tiyinToDecimal(amount), false)}
            <span className="lbl">soʼm</span>
          </div>
          <div className="display-sub">
            <span>Qoladi</span>
            <span className="val">{formatMoney(tiyinToDecimal(Math.max(balance - amount, 0)))}</span>
          </div>
        </div>
      </div>

      <div className="rg-col">
        <div className="pad compact">
          {KEYS.map((d) => (
            <button key={d} onClick={() => { setOkMsg(null); setInput((v) => pushDigit(v, d)); }}>{d}</button>
          ))}
          <button onClick={() => setInput((v) => pushDigit(pushDigit(v, '0'), '0'))}>00</button>
          <button onClick={() => setInput((v) => pushDigit(v, '0'))}>0</button>
          <button className="back" onClick={() => setInput((v) => popDigit(v))} aria-label="O'chirish">⌫</button>
        </div>

        {okMsg && <div className="ok-note">{okMsg}</div>}
        {check.ok === false && check.reason && <div className="error">{check.reason}</div>}
        {error && <div className="error">{error}</div>}

        <div className="confirm-row">
          <button className="btn ghost" onClick={() => { setOkMsg(null); setInput(String(balance / 100)); }} disabled={busy}>Hammasi</button>
          <button className="btn ink" onClick={() => void submit()} disabled={busy || !check.ok}>
            {busy ? 'Saqlanmoqda...' : 'Qabul qilish'}
          </button>
        </div>
      </div>
    </div>
  );
}
