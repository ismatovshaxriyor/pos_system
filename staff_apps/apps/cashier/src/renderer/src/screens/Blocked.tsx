import { describeError } from '@pos/shared';
import { useState } from 'react';

import { pos } from '../lib/pos';

/** Litsenziya kill-switch: server 402 yoki WS 4402 qaytargan. */
export function BlockedScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function recheck() {
    setBusy(true);
    setMessage(null);
    try {
      const unblocked = await pos.recheckLicense();
      if (!unblocked) setMessage('Tizim hali ham bloklangan.');
    } catch (e) {
      setMessage(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="panel">
        <span className="lbl">Litsenziya</span>
        <h1>Tizim bloklangan</h1>
        <p className="muted">Restoran litsenziyasi faol emas. To'lovni amalga oshiring yoki menejer bilan bog'laning.</p>
        {message && <div className="error">{message}</div>}
        <button className="btn" onClick={() => void recheck()} disabled={busy}>
          {busy ? 'Tekshirilmoqda...' : 'Qayta tekshirish'}
        </button>
      </div>
    </div>
  );
}
