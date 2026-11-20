import { describeError, formatLicenseKey, isCompleteLicenseKey } from '@pos/shared';
import { useState } from 'react';

import { pos } from '../lib/pos';

/**
 * Yangi (hali faollashtirilmagan) restoran tizimi: litsenziya kaliti kiritiladi. Muvaffaqiyatli bo'lsa
 * App o'zi login ekraniga o'tadi (menejer akkaunti markaziy tizimdan avtomatik keladi).
 */
export function SetupScreen() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    if (!isCompleteLicenseKey(key)) return;
    setBusy(true);
    setError(null);
    try {
      await pos.activateLicense(key);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void activate();
        }}
      >
        <span className="lbl">HamrohPOS · Kassir</span>
        <h1>Restoranni sozlash</h1>
        <p className="muted">Bu restoran tizimi hali sozlanmagan. HamrohPOS bergan litsenziya kalitini kiriting.</p>
        <div className="field">
          <label htmlFor="key">Litsenziya kaliti</label>
          <input
            id="key"
            value={key}
            onChange={(e) => setKey(formatLicenseKey(e.target.value))}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit" disabled={busy || !isCompleteLicenseKey(key)}>
          {busy ? 'Faollashtirilmoqda...' : 'Faollashtirish'}
        </button>
        <button type="button" className="linkbtn" onClick={() => void pos.session.clearServer()} disabled={busy}>
          Boshqa restoranga ulanish
        </button>
      </form>
    </div>
  );
}
