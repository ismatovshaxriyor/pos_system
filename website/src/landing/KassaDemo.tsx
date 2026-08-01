import React, { useEffect, useMemo, useState } from 'react';

const MENU: { n: string; p: [string, number][] }[] = [
  { n: 'Issiq taomlar', p: [['Norin', 42000], ["Lag'mon", 38000], ['Osh', 35000], ['Manti', 32000], ['Shashlik', 28000], ['Chuchvara', 30000]] },
  { n: 'Salatlar', p: [['Achchiq-chuchuk', 18000], ['Olivye', 22000], ['Bodring-pomidor', 16000], ['Sezar', 34000]] },
  { n: 'Ichimliklar', p: [['Ayron', 12000], ["Ko'k choy", 8000], ['Kompot', 10000], ['Suv 0.5', 6000]] },
  { n: 'Shirinliklar', p: [['Chak-chak', 20000], ['Muzqaymoq', 18000], ['Bodom halvo', 24000]] },
];

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

interface CartLine { n: string; p: number; q: number }

export const KassaDemo: React.FC = () => {
  const [cat, setCat] = useState(0);
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [printMsg, setPrintMsg] = useState('');
  const [clock, setClock] = useState('—');

  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat('uz', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const add = (n: string, p: number) => {
    setPrintMsg('');
    setCart((prev) => {
      const next = new Map(prev);
      const line = next.get(n) || { n, p, q: 0 };
      next.set(n, { ...line, q: line.q + 1 });
      return next;
    });
  };

  const changeQty = (n: string, delta: number) => {
    setCart((prev) => {
      const next = new Map(prev);
      const line = next.get(n);
      if (!line) return prev;
      const q = line.q + delta;
      if (q < 1) next.delete(n); else next.set(n, { ...line, q });
      return next;
    });
  };

  const { sub, srv, lines } = useMemo(() => {
    const lines = [...cart.values()];
    const sub = lines.reduce((a, l) => a + l.p * l.q, 0);
    return { sub, srv: sub * 0.1, lines };
  }, [cart]);

  const doPrint = () => {
    setPrintMsg('ok');
    setCart(new Map());
  };

  return (
    <section className="wrap sec" id="demo">
      <div className="sec__head">
        <span className="sec__num">02</span>
        <h2 className="h2">Kassa displeyi</h2>
        <span className="eyebrow" style={{ marginLeft: 'auto' }}>Interaktiv · bosib ko'ring</span>
      </div>
      <div className="pos">
        <div className="pos__bar">
          <span className="lbl">Terminal 01 · Stol 12 (VIP)</span>
          <span className="lbl">{clock}</span>
          <span className="lbl" style={{ color: 'var(--paper)' }}>Rejim: Offline</span>
        </div>
        <div className="pos__l">
          <div className="cats">
            {MENU.map((c, i) => (
              <button key={c.n} className="cat" role="tab" aria-selected={i === cat} onClick={() => setCat(i)}>{c.n}</button>
            ))}
          </div>
          <div className="prods">
            {MENU[cat].p.map(([n, p]) => (
              <button key={n} className="prod" onClick={() => add(n, p)}>
                <div className="prod__n">{n}</div>
                <div className="prod__p">{fmt(p)} so'm</div>
              </button>
            ))}
          </div>
        </div>
        <div className="pos__r">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="lbl">Joriy buyurtma</span>
            <span className="lbl">{cart.size} pozitsiya</span>
          </div>
          <div className="ord">
            {lines.length === 0 ? (
              <div className="ord__empty lbl">Buyurtma bo'sh — taom tanlang</div>
            ) : lines.map((l) => (
              <div className="ord__row" key={l.n}>
                <div>
                  <div className="ord__n">{l.n}</div>
                  <div className="lbl">{fmt(l.p)} × {l.q}</div>
                </div>
                <div className="ord__q">
                  <button className="qbtn" onClick={() => changeQty(l.n, -1)}>−</button>
                  <span className="num" style={{ minWidth: 16, textAlign: 'center', fontSize: 13 }}>{l.q}</span>
                  <button className="qbtn" onClick={() => changeQty(l.n, 1)}>+</button>
                </div>
                <div className="ord__s">{fmt(l.p * l.q)}</div>
              </div>
            ))}
          </div>
          <div className="tot">
            <div className="tot__l"><span>Oraliq jami</span><span>{fmt(sub)}</span></div>
            <div className="tot__l"><span>Xizmat haqi 10%</span><span>{fmt(srv)}</span></div>
            <div className="tot__f">
              <div>
                <div className="lbl">Yakuniy summa</div>
                <split-flap mode="num" text={String(fmt(sub + srv))} pad={9} step={48} style={{ fontSize: 'clamp(22px,2.4vw,32px)', marginTop: 6 }}></split-flap>
              </div>
              <span className="lbl">so'm</span>
            </div>
          </div>
          <button className="btn btn--sig" style={{ marginTop: 14, width: '100%' }} disabled={!lines.length} onClick={doPrint}>
            Chekni chop etish
          </button>
          <div className="lbl" style={{ marginTop: 10, textAlign: 'center', minHeight: 14 }}>
            {printMsg === 'ok' && <span style={{ color: 'var(--ok)' }}>Chek oshxonaga yuborildi · offline navbatda saqlandi</span>}
          </div>
        </div>
      </div>
    </section>
  );
};
