import { useEffect, useState } from 'react';

import type { AppUpdateState } from '../lib/update';

/** O'rnatishni boshlaydi va jarayonni kuzatadi. Muvaffaqiyatda ilova o'zi yopilib, yangisi ochiladi. */
function useInstall(serverUrl: string, state: AppUpdateState) {
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.posNative.updates.onProgress(setPercent), []);

  async function start() {
    const latest = state.info?.latest;
    if (!latest || busy) return;
    setBusy(true);
    setError(null);
    setPercent(0);
    const result = await window.posNative.updates.install(`${serverUrl}${latest.download_url}`, latest.sha256);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
    }
  }
  return { busy, percent, error, start };
}

function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="update-notes">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

/** Majburiy yangilanish: ilovaning qolgan qismiga yo'l yo'q, faqat yangilash. */
export function UpdateScreen({ serverUrl, state }: { serverUrl: string; state: AppUpdateState }) {
  const { busy, percent, error, start } = useInstall(serverUrl, state);
  const latest = state.info?.latest;
  if (!latest) return null;
  return (
    <div className="center">
      <div className="panel">
        <span className="lbl">Majburiy yangilanish</span>
        <h1>Yangi versiya: {latest.version}</h1>
        <p className="muted">
          Ilovangiz versiyasi ({state.current}) eskirgan. Davom etish uchun yangilang - bir necha daqiqa oladi, ilova
          o'zi qayta ochiladi.
        </p>
        <Notes notes={latest.notes} />
        {busy && (
          <div className="update-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${percent}%` }} />
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn" onClick={() => void start()} disabled={busy}>
          {busy ? `Yuklanmoqda... ${percent}%` : error ? 'Qayta urinish' : 'Hozir yangilash'}
        </button>
      </div>
    </div>
  );
}

/** Ixtiyoriy yangilanish: pastki chetdagi tinch eslatma; kassir o'zi qulay paytda bosadi (savat yo'qolmasligi uchun). */
export function UpdateBanner({ serverUrl, state }: { serverUrl: string; state: AppUpdateState }) {
  const { busy, percent, error, start } = useInstall(serverUrl, state);
  const [confirm, setConfirm] = useState(false);
  const latest = state.info?.latest;
  if (!latest) return null;
  return (
    <>
      <div className="update-banner">
        <span>
          Yangi versiya <b>{latest.version}</b> tayyor
        </span>
        <button className="btn ghost" onClick={() => setConfirm(true)}>Yangilash</button>
        <button className="btn ghost" onClick={state.dismiss} aria-label="Keyinroq">Keyinroq</button>
      </div>
      {confirm && (
        <div className="overlay" onClick={busy ? undefined : () => setConfirm(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-bar plain">
              <h2>Yangilash {latest.version}</h2>
            </div>
            <div className="sheet-body">
              <p className="muted">
                Yangilanish vaqtida ilova yopilib qayta ochiladi. Ochiq buyurtmalar serverda saqlanadi, lekin
                tugallanmagan savat yo'qoladi.
              </p>
              <Notes notes={latest.notes} />
              {busy && (
                <div className="update-bar" role="progressbar" aria-valuenow={percent}>
                  <div style={{ width: `${percent}%` }} />
                </div>
              )}
              {error && <div className="error">{error}</div>}
              <div className="confirm-row">
                <button className="btn ghost" onClick={() => setConfirm(false)} disabled={busy}>Bekor</button>
                <button className="btn ink" onClick={() => void start()} disabled={busy}>
                  {busy ? `Yuklanmoqda... ${percent}%` : 'Yangilash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
