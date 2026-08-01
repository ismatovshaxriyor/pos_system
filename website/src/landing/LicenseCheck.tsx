import React, { useState } from 'react';
import { checkLicense, LicenseCheckResult } from './api';

const STATUS_META: Record<LicenseCheckResult['status'], { theme: string; label: string }> = {
  active: { theme: 'ok', label: 'FAOL' },
  expired: { theme: 'warn', label: "MUDDATI TUGAGAN" },
  inactive: { theme: 'sig', label: 'NOFAOL' },
  not_found: { theme: 'sig', label: 'TOPILMADI' },
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('uz', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
  } catch {
    return '—';
  }
}

export const LicenseCheck: React.FC = () => {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LicenseCheckResult | null>(null);

  const check = async (override?: string) => {
    const trimmed = (override ?? key).trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      const res = await checkLicense(trimmed);
      setResult(res);
    } catch {
      setResult({ status: 'not_found', detail: 'Tekshirishda xatolik yuz berdi. Birozdan so\'ng qayta urinib ko\'ring.' });
    } finally {
      setLoading(false);
    }
  };

  const useChip = (code: string) => {
    setKey(code);
    check(code);
  };

  const meta = result ? STATUS_META[result.status] : null;

  return (
    <section className="wrap sec" id="litsenziya">
      <div className="sec__head">
        <span className="sec__num">05</span>
        <h2 className="h2">Litsenziya tekshiruvi</h2>
        <span className="eyebrow" style={{ marginLeft: 'auto' }}>Ochiq xizmat</span>
      </div>
      <div className="lic">
        <div>
          <p className="lede">Restoraningizga berilgan litsenziya kalitini kiriting — holat va amal qilish muddati darhol ko'rsatiladi.</p>
          <div className="field">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && check()}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn btn--sig" onClick={() => check()} disabled={loading}>{loading ? '…' : 'Tekshirish'}</button>
          </div>
          <div className="codes">
            <span className="lbl" style={{ alignSelf: 'center' }}>Demo kalitlar:</span>
            <button className="chip" onClick={() => useChip('HMR-2026-DEMO')}>HMR-2026-DEMO</button>
            <button className="chip" onClick={() => useChip('HMR-2025-TEST')}>HMR-2025-TEST</button>
          </div>
        </div>
        <div className="lic__out">
          <div>
            <span className="lbl">Holat</span>
            <split-flap className="lic__badge" theme={(meta?.theme as never) ?? 'bare'} text={meta?.label ?? 'KUTILMOQDA'} pad={15} step={54}></split-flap>
          </div>
          <div className="lic__rows">
            <div className="lic__row"><span>Kalit</span><span>{result ? key.trim().toUpperCase() : '—'}</span></div>
            {result?.status === 'not_found' && <div className="lic__row"><span>Holat</span><span>Bazada yo'q</span></div>}
            {result && result.status !== 'not_found' && (
              <>
                <div className="lic__row"><span>Restoran</span><span>{result.restaurant}</span></div>
                <div className="lic__row"><span>{result.status === 'expired' ? 'Tugagan' : 'Amal qiladi'}</span><span>{fmtDate(result.expires_at)}</span></div>
                <div className="lic__row"><span>Qurilma</span><span>{result.hardware_bound ? "Bog'langan" : "Bog'lanmagan"}</span></div>
              </>
            )}
            {!result && <div className="lic__row"><span>Holat</span><span>Tekshirilmagan</span></div>}
          </div>
        </div>
      </div>
    </section>
  );
};
