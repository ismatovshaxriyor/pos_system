import { describeError, findServers, mdnsToUrls, type FoundServer, type ScanProgress } from '@pos/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pos } from '../lib/pos';

/** Server shu kompyuterning o'zida bo'lishi ham mumkin (kassa = server), avval shu manzillar tekshiriladi. */
// 8010/8020 - dev compose portlari (bir mashinada bir nechta stack).
const QUICK_URLS = ['localhost:8000', 'localhost:8010', 'localhost:8020', 'pos-bola.local:8000'];

/**
 * Birinchi ishga tushirish: restoran serveri (Bola) tarmoqdan o'zi topiladi. Bitta server topilsa darhol
 * ulanadi; bir nechta bo'lsa tanlash ro'yxati chiqadi. Topilmasa manzilni qo'lda kiritish mumkin.
 */
export function ConnectScreen() {
  const [servers, setServers] = useState<FoundServer[]>([]);
  const [searching, setSearching] = useState(true);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Qidiruvda hech narsa topilmadi, lekin kamida bitta manzil javob berib rad etdi (masalan 400) - demak
      tarmoqda server bor, lekin noto'g'ri sozlangan. */
  const [rejected, setRejected] = useState<{ url: string; status: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async (target: string) => {
    if (!target.trim()) return;
    setBusy(target);
    setError(null);
    try {
      await pos.connectToServer(target);
      // Muvaffaqiyatli bo'lsa App keyingi ekranga o'zi o'tadi.
    } catch (e) {
      setError(describeError(e));
      setBusy(null);
    }
  }, []);

  const search = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    setServers([]);
    setProgress(null);
    setError(null);
    setRejected(null);
    let localIps: string[] = [];
    try {
      localIps = await window.posNative.network.localAddresses();
    } catch {
      /* manzillarsiz ham localhost tekshiriladi */
    }
    let mdnsUrls: string[] = [];
    try {
      mdnsUrls = mdnsToUrls(await window.posNative.network.browseMdns());
    } catch {
      /* mDNS bo'lmasa - skaner ishlaydi */
    }
    // Sekin tarmoq/yuklangan server bitta urinishda ulgurmasligi mumkin: topilmasa timeout'ni oshirib qayta urinamiz.
    let found: FoundServer[] = [];
    for (const timeoutMs of [800, 2000, 4000]) {
      if (ctrl.signal.aborted) return;
      found = await findServers({
        localIps,
        extraUrls: [...mdnsUrls, ...QUICK_URLS],
        timeoutMs,
        extraTimeoutMs: Math.max(2500, timeoutMs),
        signal: ctrl.signal,
        onProgress: setProgress,
        onFound: (s) => setServers((prev) => (prev.some((p) => p.url === s.url) ? prev : [...prev, s])),
        onRejected: (url, status) => setRejected({ url, status }),
      });
      if (found.length > 0) break;
    }
    if (ctrl.signal.aborted) return;
    setSearching(false);
    if (found.length === 1) void connect(found[0]!.url);
  }, [connect]);

  useEffect(() => {
    void search();
    return () => abortRef.current?.abort();
  }, [search]);

  const showManual = manual || (!searching && servers.length === 0);

  return (
    <div className="center">
      <div className="panel">
        <span className="lbl">HamrohPOS · Kassir</span>
        <h1>Restoranga ulanish</h1>

        {searching && (
          <p className="muted">
            Restoran tizimi qidirilmoqda…
            {progress && progress.total > 0 ? ` ${Math.round((progress.done / progress.total) * 100)}%` : ''}
          </p>
        )}
        {!searching && servers.length === 0 && rejected && (
          <div className="error">
            Tarmoqda server topildi ({rejected.url}), lekin u javobni rad etdi (xato {rejected.status}). Server
            noto'g'ri sozlangan bo'lishi mumkin - administratorga murojaat qiling.
          </div>
        )}
        {!searching && servers.length === 0 && !rejected && (
          <p className="muted">Restoran tizimi topilmadi. Kompyuter restoran WiFi/tarmog'iga ulanganini tekshiring.</p>
        )}

        {servers.length > 0 && (
          <div className="found-list">
            {servers.map((s) => (
              <button key={s.url} className="found" onClick={() => void connect(s.url)} disabled={busy !== null}>
                <span className="found-name">{s.info.activated ? s.info.restaurant_name : 'Yangi restoran'}</span>
                {!s.info.activated && <span className="lbl">Hali sozlanmagan</span>}
              </button>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {showManual ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void connect(url);
            }}
          >
            <div className="field">
              <label htmlFor="url">Tizim manzili (menejerdan oling)</label>
              <input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="192.168.1.50:8000" inputMode="url" />
            </div>
            <button className="btn" type="submit" disabled={busy !== null || !url.trim()}>
              {busy === url ? 'Tekshirilmoqda...' : 'Ulanish'}
            </button>
          </form>
        ) : (
          <button className="linkbtn" onClick={() => setManual(true)}>Topilmadimi? Manzilni qo'lda kiriting</button>
        )}

        {!searching && (
          <button className="btn ghost" onClick={() => void search()} disabled={busy !== null}>Qayta qidirish</button>
        )}
      </div>
    </div>
  );
}
