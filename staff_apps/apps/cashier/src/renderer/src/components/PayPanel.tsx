import {
  enteredTiyin,
  formatMoney,
  planPayment,
  popDigit,
  pushDigit,
  suggestCashAmounts,
  tiyinToDecimal,
  toTiyin,
  type Order,
  type PaymentMethod,
  type PaymentPlan,
} from '@pos/shared';
import { useEffect, useMemo, useState } from 'react';

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Naqd' },
  { id: 'card', label: 'Karta' },
  { id: 'other', label: 'Boshqa' },
];
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

/**
 * To'lov paneli. Hech narsa kiritilmasa "To'lash" aniq qolgan summani to'laydi (karta/QR - bir bosish).
 * Naqdda: tez summa tugmalari + qaytim. Jismoniy klaviatura ham ishlaydi (raqamlar, Backspace, Enter, Esc).
 */
export function PayPanel({
  order,
  busy,
  error,
  onPay,
  onClose,
}: {
  order: Order;
  busy: boolean;
  error: string | null;
  onPay: (plan: Extract<PaymentPlan, { ok: true }>, method: PaymentMethod) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [input, setInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const due = toTiyin(order.balance_due);
  // Boshqa buyurtmaga o'tilganda kiritilgan summa tozalansin.
  useEffect(() => {
    setInput('');
    setLocalError(null);
  }, [order.id]);

  const plan = useMemo(
    () => planPayment({ method, dueTiyin: due, enteredTiyin: input === '' ? null : enteredTiyin(input) }),
    [method, due, input],
  );
  const suggestions = method === 'cash' ? suggestCashAmounts(due) : [];

  function submit() {
    if (busy) return;
    if (!plan.ok) return setLocalError(plan.reason);
    setLocalError(null);
    onPay(plan, method);
  }

  // Jismoniy klaviatura (monoblokka ulangan bo'lsa).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Qidiruv maydonida yozilayotganda raqamlar to'lov summasiga tushmasin.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) setInput((v) => pushDigit(v, e.key));
      else if (e.key === 'Backspace') setInput((v) => popDigit(v));
      else if (e.key === 'Escape') setInput('');
      else if (e.key === 'Enter') submit();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Hozir nima yoziladi / qaytim - kassir bir qarashda ko'rsin.
  const showChange = plan.ok && plan.changeTiyin > 0;
  const shownAmount = input === '' ? due : enteredTiyin(input);
  const message = localError ?? error ?? (!plan.ok && input !== '' ? plan.reason : null);

  return (
    <div className="pay">
      <div className="tabs">
        {METHODS.map((m) => (
          <button key={m.id} data-m={m.id} className={method === m.id ? 'active' : ''} onClick={() => setMethod(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="display">
        <div className="display-label">{method === 'cash' ? 'Mijoz berdi' : 'Toʼlov summasi'}</div>
        <div className={`display-amount ${input === '' ? 'placeholder' : ''}`}>
          {formatMoney(tiyinToDecimal(shownAmount), false)}
          <span className="lbl">soʼm</span>
        </div>
        <div className={`display-sub ${showChange ? 'change' : ''}`}>
          {showChange && plan.ok ? (
            <>
              <span>Qaytim</span>
              <span className="val">{formatMoney(tiyinToDecimal(plan.changeTiyin))}</span>
            </>
          ) : plan.ok && plan.payTiyin < due ? (
            <>
              <span>Qoladi</span>
              <span className="val">{formatMoney(tiyinToDecimal(due - plan.payTiyin))}</span>
            </>
          ) : null}
        </div>
      </div>

      {method === 'cash' && (
        <div className="quick">
          <button onClick={() => setInput('')}>Aniq</button>
          {suggestions.map((s) => (
            <button key={s} onClick={() => setInput(String(s / 100))}>
              {formatMoney(tiyinToDecimal(s)).replace(/ ?so.m$/, '')}
            </button>
          ))}
        </div>
      )}

      <div className="pad">
        {KEYS.map((d) => (
          <button key={d} onClick={() => setInput((v) => pushDigit(v, d))}>{d}</button>
        ))}
        <button onClick={() => setInput((v) => pushDigit(pushDigit(v, '0'), '0'))}>00</button>
        <button onClick={() => setInput((v) => pushDigit(v, '0'))}>0</button>
        <button className="back" onClick={() => setInput((v) => popDigit(v))} onDoubleClick={() => setInput('')} aria-label="O'chirish">⌫</button>
      </div>

      {message && <div className="error pay-error">{message}</div>}

      <div className="pay-actions">
        <button className="btn ghost" onClick={onClose} disabled={busy}>Yopish</button>
        <button className="btn go" onClick={submit} disabled={busy || (input !== '' && !plan.ok)}>
          {busy ? (
            'Yuborilmoqda...'
          ) : (
            <>
              <span className="go-label">To'lash</span>
              <span className="go-amount">{formatMoney(tiyinToDecimal(plan.ok ? plan.payTiyin : due))}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
