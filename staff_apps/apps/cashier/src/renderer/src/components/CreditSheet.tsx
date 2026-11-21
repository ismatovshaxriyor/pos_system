import {
  customerName,
  describeError,
  DUE_DAY_OPTIONS,
  dueDateFromDays,
  formatMoney,
  orderLabel,
  formatPhone,
  normalizePhone,
  tiyinToDecimal,
  toTiyin,
  type Customer,
  type Order,
} from '@pos/shared';
import { useEffect, useState } from 'react';

import { pos } from '../lib/pos';

/**
 * Qarzga (nasiyaga) yozish: mijozni topish yoki yangisini ochish, qaytarish muddati, tasdiq.
 * Bu pulga tegadigan, qaytarib bo'lmaydigan amal - shuning uchun tasdiq tugmasi alohida (siyoh), qizil emas.
 * Avval qisman to'langan bo'lsa serverning o'zi faqat QOLGAN summani yozadi.
 */
export function CreditSheet({
  order,
  onClose,
  onDone,
}: {
  order: Order;
  onClose: () => void;
  onDone: (customer: Customer) => void;
}) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Customer[] | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const due = toTiyin(order.balance_due);

  // Qidiruv: yozishdan to'xtagach (debounce) so'raladi; bo'sh qidiruv = qarzdorlar tepada.
  useEffect(() => {
    if (selected || creating) return;
    let alive = true;
    const t = setTimeout(() => {
      pos.api.customers
        .list({ search: query.trim() })
        .then((r) => alive && setList(r.results))
        .catch((e) => alive && setError(describeError(e)));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, selected, creating]);

  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pos.api.orders.closeOnCredit(order.id, { customer_id: selected.id, due_date: dueDateFromDays(days) });
      onDone(selected);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-bar plain">
          <h2>Qarzga yozish</h2>
        </div>
        <div className="sheet-body">
          <div className="credit-sum">
            <span className="lbl">{orderLabel(order)} · qarzga yoziladi</span>
            <span className="mono big">{formatMoney(tiyinToDecimal(due))}</span>
          </div>

          {selected ? (
            <>
              <div className="cust-card">
                <div>
                  <div className="cust-name">{customerName(selected)}</div>
                  <div className="lbl">
                    {selected.phone || 'Telefon yoʼq'} · hozirgi qarzi {formatMoney(selected.balance)}
                  </div>
                </div>
                <button className="linkbtn" onClick={() => setSelected(null)} disabled={busy}>
                  O'zgartirish
                </button>
              </div>

              <div>
                <span className="lbl">Qachon qaytaradi</span>
                <div className="tabs" style={{ marginTop: 6 }}>
                  {DUE_DAY_OPTIONS.map((d) => (
                    <button key={String(d)} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>
                      {d === null ? 'Muddatsiz' : `${d} kun`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="line total">
                <span>Mijoz qarzi bo'ladi</span>
                <span>{formatMoney(tiyinToDecimal(toTiyin(selected.balance) + due))}</span>
              </div>
            </>
          ) : creating ? (
            <NewCustomer
              initialName={query}
              onCancel={() => setCreating(false)}
              onCreated={(c) => {
                setCreating(false);
                setSelected(c);
              }}
            />
          ) : (
            <>
              <div className="field">
                <label htmlFor="c-search">Mijoz</label>
                <input
                  id="c-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ism yoki telefon bo'yicha qidirish"
                  autoFocus
                />
              </div>
              <div className="cust-list">
                {list === null && <div className="muted">Yuklanmoqda...</div>}
                {list?.length === 0 && <div className="muted">Mijoz topilmadi.</div>}
                {list?.map((c) => (
                  <button key={c.id} className="cust-row" onClick={() => setSelected(c)}>
                    <span>
                      <span className="cust-name">{customerName(c)}</span>
                      <span className="lbl">{c.phone}</span>
                    </span>
                    {toTiyin(c.balance) > 0 && <span className="ot-time">{formatMoney(c.balance)}</span>}
                  </button>
                ))}
              </div>
              <button className="btn ghost" onClick={() => setCreating(true)}>+ Yangi mijoz</button>
            </>
          )}

          {error && <div className="error">{error}</div>}

          {!creating && (
            <div className="confirm-row">
              <button className="btn ghost" onClick={onClose} disabled={busy}>Bekor</button>
              {selected && (
                <button className="btn ink" onClick={() => void confirm()} disabled={busy}>
                  {busy ? 'Yozilmoqda...' : 'Qarzga yozish'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewCustomer({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (c: Customer) => void;
}) {
  // Qidiruvga telefon yozilgan bo'lsa shu telefon maydoniga tushadi, aks holda ism.
  const looksLikePhone = /^[+\d\s()-]{5,}$/.test(initialName.trim());
  const [first, setFirst] = useState(looksLikePhone ? '' : initialName.trim());
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState(looksLikePhone ? formatPhone(initialName) : '+998');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Telefon ixtiyoriy: faqat "+998" qolgan bo'lsa bo'sh deb hisoblaymiz.
  const phoneFilled = phone.replace(/\D/g, '').length > 3;
  const normalized = phoneFilled ? normalizePhone(phone) : '';
  const valid = first.trim().length > 0 && (!phoneFilled || !!normalized);

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await pos.api.customers.create({ first_name: first.trim(), last_name: last.trim(), phone: normalized || '' });
      onCreated(c);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <form
      className="new-cust"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="field">
        <label htmlFor="n-first">Ism</label>
        <input id="n-first" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="n-last">Familya (ixtiyoriy)</label>
        <input id="n-last" value={last} onChange={(e) => setLast(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="n-phone">Telefon (ixtiyoriy)</label>
        <input id="n-phone" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} inputMode="tel" />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="confirm-row">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Orqaga</button>
        <button type="submit" className="btn ink" disabled={!valid || busy}>
          {busy ? 'Saqlanmoqda...' : 'Saqlash va tanlash'}
        </button>
      </div>
    </form>
  );
}
