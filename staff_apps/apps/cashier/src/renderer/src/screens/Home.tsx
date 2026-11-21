import { describeError, filterOrders, formatMoney, fullName, sortOpenOrders, stepSelection, tiyinToDecimal, toTiyin } from '@pos/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DayEndSheet } from '../components/DayEndSheet';
import { DebtSheet } from '../components/DebtSheet';
import { Flap } from '../components/Flap';
import { MenuSheet } from '../components/MenuSheet';
import { NewOrder, type Destination } from '../components/NewOrder';
import { OrderList } from '../components/OrderList';
import { TableGrid } from '../components/TableGrid';
import { ShiftSheet } from '../components/ShiftSheet';
import { Workspace } from '../components/Workspace';
import { useBootstrap, useRealtimeStatus, useSession } from '../lib/hooks';
import { pos } from '../lib/pos';

/** Shundan ko'p ochiq buyurtma bo'lsa qidiruv maydoni ko'rsatiladi. */
const SEARCH_MIN_ORDERS = 4;

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
  /** Chap ustun: ochiq buyurtmalar yoki hamma stollar (bo'sh/band). */
  const [leftTab, setLeftTab] = useState<'orders' | 'tables'>('orders');
  /** Yangi buyurtma ekrani ochiq (boshlang'ich manzil bilan yoki manzilni tanlashdan). */
  const [creating, setCreating] = useState<null | { dest: Destination | null }>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [debtsOpen, setDebtsOpen] = useState(false);
  const [shiftsOpen, setShiftsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  /** 'view' - oddiy hisobot; 'close' - kassani yopish (hisobot ichida tasdiq). */
  const [dayEnd, setDayEnd] = useState<null | 'view' | 'close'>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const roleLabel = user?.role === 'manager' ? 'Menejer' : 'Kassir';
  const orders = data?.active_orders ?? [];
  const current = selected;
  const totalDue = orders.reduce((s, o) => s + toTiyin(o.balance_due), 0);
  const closePanel = useCallback(() => setSelected(null), []);
  const selectOrder = useCallback((id: number) => {
    setCreating(null);
    setSelected(id);
  }, []);
  // Qidiruv maydoni faqat ro'yxat uzun bo'lganda ko'rinadi; yashirin bo'lsa eski so'rov ro'yxatni filtrlamasin.
  const tables = data?.tables ?? [];
  const activeTableCount = tables.filter((t) => t.is_active).length;
  const searchShown = leftTab === 'orders' && orders.length > SEARCH_MIN_ORDERS;
  const activeQuery = searchShown ? query : '';
  const visible = useMemo(() => sortOpenOrders(filterOrders(orders, activeQuery)), [orders, activeQuery]);
  const sheetOpen = menuOpen || debtsOpen || shiftsOpen || dayEnd !== null || creating !== null;

  // Klaviatura: "/" yoki Ctrl+F - qidiruv, ↑/↓ - buyurtmalar bo'ylab (monoblokka klaviaturasi ulangan bo'lsa).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (sheetOpen) return; // oyna ochiq: orqadagi ro'yxat klaviaturaga javob bermasin
      const t = e.target;
      const typing =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape' && typing && e.target === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(e.ctrlKey || e.metaKey || e.altKey)) {
        if (typing && e.target !== searchRef.current) return;
        setSelected((cur) => stepSelection(visible, cur, e.key === 'ArrowDown' ? 1 : -1));
      } else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, sheetOpen]);

  async function toggleRegister() {
    setActionError(null);
    setMenuOpen(false);
    try {
      await pos.api.register.open();
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
        <button
          className={`btn menu-btn refresh-btn ${refreshing ? 'spinning' : ''}`}
          onClick={() => {
            if (refreshing) return;
            setRefreshing(true);
            // Real-vaqt uzilib qolgan bo'lsa ham qo'lda yangilash ishlaydi; kamida bir aylanish ko'rinsin.
            void Promise.allSettled([refresh(), new Promise((r) => setTimeout(r, 600))]).then(() => setRefreshing(false));
          }}
          aria-label="Yangilash"
          title="Yangilash"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <path d="M20 4v7h-7" />
          </svg>
        </button>
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
          <div className="col-new">
            <button
              className="btn go solo"
              onClick={() => {
                setSelected(null);
                setCreating({ dest: null });
              }}
              disabled={data ? !data.register_open : false}
            >
              + Yangi buyurtma
            </button>
          </div>
          <div className="col-tabs tabs" role="tablist" aria-label="Chap ustun">
            <button role="tab" aria-selected={leftTab === 'orders'} className={leftTab === 'orders' ? 'active' : ''} onClick={() => setLeftTab('orders')}>
              Buyurtmalar <span className="count">{orders.length}</span>
            </button>
            <button role="tab" aria-selected={leftTab === 'tables'} className={leftTab === 'tables' ? 'active' : ''} onClick={() => setLeftTab('tables')}>
              Stollar <span className="count">{activeTableCount}</span>
            </button>
          </div>
          {searchShown && (
            <div className="orders-search">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Stol, ofitsiant yoki raqam (/)"
                aria-label="Buyurtma qidirish"
              />
            </div>
          )}
          <div className="orders-scroll">
            {loading && !data ? <div className="orders-empty muted">Yuklanmoqda...</div> : leftTab === 'tables' ? (
              <TableGrid
                tables={tables}
                orders={orders}
                selectedId={current}
                onSelect={selectOrder}
                onPickFree={data?.register_open === false ? undefined : (tableId) => {
                  setSelected(null);
                  setCreating({ dest: { kind: 'table', tableId } });
                }}
              />
            ) : (
              <OrderList
                orders={visible}
                selectedId={current}
                onSelect={selectOrder}
                emptyText={query.trim() ? 'Hech narsa topilmadi' : undefined}
              />
            )}
          </div>
        </aside>

        {creating ? (
          <NewOrder
            key={creating.dest ? JSON.stringify(creating.dest) : 'pick'}
            initial={creating.dest}
            onCancel={() => setCreating(null)}
            onCreated={(id) => {
              setCreating(null);
              setSelected(id);
              void refresh();
            }}
          />
        ) : current !== null ? (
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
          onCloseRegister={() => {
            setMenuOpen(false);
            setDayEnd('close');
          }}
          onSignOut={() => void pos.session.signOut()}
          onToggleFullscreen={window.posNative.platform === 'win32' ? () => void window.posNative.window.toggleFullscreen() : undefined}
          onOpenDebts={() => {
            setMenuOpen(false);
            setDebtsOpen(true);
          }}
          onOpenDayEnd={() => {
            setMenuOpen(false);
            setDayEnd('view');
          }}
          onOpenShifts={() => {
            setMenuOpen(false);
            setShiftsOpen(true);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {debtsOpen && <DebtSheet onClose={() => setDebtsOpen(false)} />}
      {shiftsOpen && <ShiftSheet onClose={() => setShiftsOpen(false)} />}
      {dayEnd && (
        <DayEndSheet
          onClose={() => setDayEnd(null)}
          onCloseRegister={
            dayEnd === 'close'
              ? async () => {
                  setActionError(null);
                  await pos.api.register.close();
                  setDayEnd(null);
                  await refresh();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
