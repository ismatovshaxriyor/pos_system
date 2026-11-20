import {
  checkDiscount,
  describeError,
  discountFromPercent,
  enteredTiyin,
  formatMoney,
  hasDiscount,
  popDigit,
  pushDigit,
  tiyinToDecimal,
  toTiyin,
  type Order,
} from '@pos/shared';
import { useState } from 'react';

import { pos } from '../lib/pos';

const PERCENTS = [5, 10, 15, 20];
const REASONS = ['Doimiy mijoz', 'Xodim', 'Uzr (kechikish/xato)'];
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

/**
 * Chegirma (faqat menejer - serverda ham shunday). Foiz tugmalari yoki aniq summa; sabab ixtiyoriy.
 * Chegirma mahsulotlar jamidan oshmaydi (server ham tekshiradi). 0 yuborish = chegirmani olib tashlash.
 */
export function DiscountSheet({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const total = toTiyin(order.total_amount);
  const [input, setInput] = useState(hasDiscount(order.discount_amount) ? String(toTiyin(order.discount_amount) / 100) : '');
  const [reason, setReason] = useState(order.discount_reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discount = enteredTiyin(input);
  const check = checkDiscount(discount, total);
  const afterTiyin = Math.max(total - discount + toTiyin(order.tax_amount) + toTiyin(order.service_charge), 0);

  async function save(amountTiyin: number, why: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await pos.api.orders.setDiscount(order.id, { discount_amount: tiyinToDecimal(amountTiyin), discount_reason: why });
      onDone();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-bar plain">
          <h2>Chegirma</h2>
        </div>
        <div className="sheet-body">
          <span className="lbl">Mahsulotlar jami: {formatMoney(order.total_amount)}</span>

          <div className="quick">
            {PERCENTS.map((p) => (
              <button key={p} onClick={() => setInput(String(discountFromPercent(total, p) / 100))}>
                {p}%
              </button>
            ))}
          </div>

          <div className="display">
            <div className="display-label">Chegirma summasi</div>
            <div className={`display-amount ${input === '' ? 'placeholder' : ''}`}>
              {formatMoney(tiyinToDecimal(discount), false)}
              <span className="lbl">soʼm</span>
            </div>
            <div className="display-sub">
              <span>To'lanadi</span>
              <span className="val">{formatMoney(tiyinToDecimal(afterTiyin))}</span>
            </div>
          </div>

          <div className="pad compact">
            {KEYS.map((d) => (
              <button key={d} onClick={() => setInput((v) => pushDigit(v, d))}>{d}</button>
            ))}
            <button onClick={() => setInput((v) => pushDigit(pushDigit(v, '0'), '0'))}>00</button>
            <button onClick={() => setInput((v) => pushDigit(v, '0'))}>0</button>
            <button className="back" onClick={() => setInput((v) => popDigit(v))} aria-label="O'chirish">⌫</button>
          </div>

          <div className="quick reasons">
            {REASONS.map((r) => (
              <button key={r} className={reason === r ? 'on' : ''} onClick={() => setReason((v) => (v === r ? '' : r))}>
                {r}
              </button>
            ))}
          </div>

          {!check.ok && <div className="error">{check.reason}</div>}
          {error && <div className="error">{error}</div>}

          <div className="confirm-row">
            <button className="btn ghost" onClick={onClose} disabled={busy}>Bekor</button>
            <button className="btn ink" onClick={() => void save(discount, discount > 0 ? reason : '')} disabled={busy || !check.ok}>
              {busy ? 'Saqlanmoqda...' : discount > 0 ? "Qo'llash" : 'Chegirmasiz saqlash'}
            </button>
          </div>
          {hasDiscount(order.discount_amount) && (
            <button className="linkbtn" onClick={() => void save(0, '')} disabled={busy}>
              Mavjud chegirmani olib tashlash
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
