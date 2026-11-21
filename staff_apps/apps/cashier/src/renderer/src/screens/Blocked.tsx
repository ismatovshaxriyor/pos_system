import { describeError } from '@pos/shared';
import { useState } from 'react';

import { pos } from '../lib/pos';

/** Litsenziya kill-switch: server 402 yoki WS 4402 qaytargan. */
export function BlockedScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');

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

  // Internet yo'q joyda: Ona admini yuborgan oflayn tokenni kiritish (Bola uni internetsiz tekshiradi).
  async function applyToken() {
    setBusy(true);
    setMessage(null);
    try {
      const unblocked = await pos.applyOfflineToken(token);
      if (!unblocked) setMessage('Token qabul qilindi, lekin tizim hali ham bloklangan. Menejer bilan bog\'laning.');
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
        <button className="btn ghost" onClick={() => setShowToken((v) => !v)} disabled={busy}>
          Internet yo'qmi? Oflayn token kiritish
        </button>
        {showToken && (
          <div className="field">
            <label htmlFor="offline-token">Oflayn token (Telegram/SMS orqali yuborilgan)</label>
            <input
              id="offline-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJ..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn" onClick={() => void applyToken()} disabled={busy || token.trim().length < 20}>
              Tokenni qo'llash
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
