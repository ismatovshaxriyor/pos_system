import { describeError, formatMoney, fullName, tiyinToDecimal, toTiyin } from '@pos/shared';
import { useCallback, useEffect, useState } from 'react';

import { DebtSheet } from '../components/DebtSheet';
import { Flap } from '../components/Flap';
import { MenuSheet } from '../components/MenuSheet';
import { OrderList } from '../components/OrderList';
import { Workspace } from '../components/Workspace';
import { useBootstrap, useRealtimeStatus, useSession } from '../lib/hooks';
import { pos } from '../lib/pos';

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return <span className="clock">{t.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>;
}

/** Kassir asosiy ekrani: [ochiq buyurtmalar] [chek] [to'lov] - hammasi bir ekranda, scrollsiz. */
export function HomeScreen() {
  const { user } = useSession();
  const rt = useRealtimeStatus();
  const { data, loading, error, refresh } = useBootstrap();
  const [selected, setSelected] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [debtsOpen, setDebtsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const roleLabel = user?.role === 'manager' ? 'Menejer' : 'Kassir';
  const orders = data?.active_orders ?? [];
  const current = selected;
  const totalDue = orders.reduce((s, o) => s + toTiyin(o.balance_due), 0);
  const closePanel = useCallback(() => setSelected(null), []);

  async function toggleRegister() {
    setActionError(null);
    setMenuOpen(false);
    try {
      if (data?.register_open) await pos.api.register.close();
      else await pos.api.register.open();
      await refresh();
    } catch (e) {
      setActionError(describeError(e));
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand-sm">HamrohPOS</span>
        <span className="grow" />
        <div className="who">
          <strong>{fullName(user)}</strong>
          <span className="muted">{roleLabel}</span>
        </div>
        <span className={`live ${rt === 'open' ? 'on' : ''}`}>{rt === 'open' ? 'Jonli' : 'Ulanmoqda...'}</span>
        <Clock />
        <button className="btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Menyu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      {data && !data.register_open && (
        <div className="banner">
          <span>Kassa yopiq — yangi buyurtma ochilmaydi.</span>
          <button className="btn" onClick={() => void toggleRegister()}>Kassani ochish</button>
        </div>
      )}
      {(error || actionError) && <div className="banner err">{actionError ?? error}</div>}

      <main className="main">
        <aside className="col-orders">
          <div className="col-title">
            <span>Ochiq buyurtmalar</span>
            <span className="count">{orders.length}</span>
          </div>
          <div className="orders-scroll">
            {loading && !data ? <div className="orders-empty muted">Yuklanmoqda...</div> : (
              <OrderList orders={orders} selectedId={current} onSelect={setSelected} />
            )}
          </div>
        </aside>

        {current !== null ? (
          <Workspace key={current} orderId={current} onChanged={() => void refresh()} onClose={closePanel} />
        ) : (
          <section className="idle">
            <div className="idle-num">{orders.length}</div>
            <div className="muted">ochiq buyurtma</div>
            <div className="idle-due"><Flap text={formatMoney(tiyinToDecimal(totalDue), false)} /></div>
            <div className="muted">soʼm to'lanishi kutilmoqda</div>
            <div className="idle-hint">← To'lov uchun buyurtmani tanlang</div>
          </section>
        )}
      </main>

      {menuOpen && data && (
        <MenuSheet
          registerOpen={data.register_open}
          who={`${fullName(user)} · ${roleLabel}`}
          onToggleRegister={() => void toggleRegister()}
          onSignOut={() => void pos.session.signOut()}
          onToggleFullscreen={window.posNative.platform === 'win32' ? () => void window.posNative.window.toggleFullscreen() : undefined}
          onOpenDebts={() => {
            setMenuOpen(false);
            setDebtsOpen(true);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {debtsOpen && <DebtSheet onClose={() => setDebtsOpen(false)} />}
    </div>
  );
}
