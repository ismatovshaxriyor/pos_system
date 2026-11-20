import { describeError } from '@pos/shared';
import { useState } from 'react';

import { pos } from '../lib/pos';

/**
 * Birinchi ishga tushirish: restoran serveri (Bola) manzili. Odatda kassa shu
 * serverning o'zi turgan tarmoqda (yoki bir mashinada: `localhost:8000`).
 */
export function ConnectScreen() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await pos.connectToServer(url);
      // Muvaffaqiyatli bo'lsa App keyingi ekranga o'zi o'tadi.
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <span className="lbl">HamrohPOS · Kassir</span>
        <h1>Serverga ulanish</h1>
        <p className="muted">Restoran serveri manzilini kiriting (masalan 192.168.1.50:8000).</p>
        <div className="field">
          <label htmlFor="url">Server manzili</label>
          <input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="192.168.1.50:8000" inputMode="url" autoFocus />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit" disabled={busy || !url.trim()}>
          {busy ? 'Tekshirilmoqda...' : 'Ulanish'}
        </button>
      </form>
    </div>
  );
}
