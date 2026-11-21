import { describeError, elapsedLabel, fullName, type AttendanceRecord } from '@pos/shared';
import { useCallback, useEffect, useState } from 'react';

import { pos } from '../lib/pos';

const ROLE = { manager: 'Menejer', waiter: 'Ofitsiant', cashier: 'Kassir' } as const;

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

/** Hozir smenada turgan xodimlar (kim kelgan, qachondan beri). Smena telefon ilovasidan belgilanadi. */
export function ShiftSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await pos.api.attendance.onShift());
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-bar plain">
          <h2>Smenadagi xodimlar</h2>
        </div>
        <div className="sheet-body">
          {error && <div className="error">{error}</div>}
          {!rows && !error && <div className="muted">Yuklanmoqda...</div>}
          {rows && rows.length === 0 && <div className="muted">Hozir hech kim smenada emas.</div>}
          {rows && rows.length > 0 && (
            <div className="de-card">
              <span className="lbl">Hozir ishda · {rows.length}</span>
              {rows.map((a) => (
                <div key={a.id} className="de-row">
                  <span>
                    {fullName(a.user)} <span className="muted">· {ROLE[a.user.role]}</span>
                  </span>
                  <span className="mono">
                    {time(a.check_in)} · {elapsedLabel(a.check_in, Date.now())}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="confirm-row">
            <button className="btn ghost" onClick={() => void load()}>Yangilash</button>
            <button className="btn ink" onClick={onClose}>Yopish</button>
          </div>
        </div>
      </div>
    </div>
  );
}
