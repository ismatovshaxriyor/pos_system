import React from 'react';
import { useApp } from '../context/AppContext';

export const Header: React.FC = () => {
  const { tab, setTab, table, live, demoEmpty, setDemoEmpty } = useApp();

  const tableLabel = table
    ? (table.zone_name ? `${table.table_name} (${table.zone_name})` : String(table.table_name || '—'))
    : '—';

  return (
    <>
      {!live && (
        <div className="demobar" id="demobar">
          <span className="lbl">Demo · backend ulanmagan</span>
          <button className="dbtn" aria-pressed={!demoEmpty} onClick={() => setDemoEmpty(false)}>Buyurtma bor</button>
          <button className="dbtn" aria-pressed={demoEmpty} onClick={() => setDemoEmpty(true)}>Bo'sh</button>
        </div>
      )}
      <header className="hd">
        <div className="hd__top">
          <div className="mark"><b>HamrohPOS</b><i></i></div>
          <div className="hd__tbl">
            <span className="lbl">Stol</span>
            <split-flap mode="alpha" text={tableLabel} pad={8} step={56}></split-flap>
          </div>
        </div>
        <div className="tabs">
          <button className="tab" aria-selected={tab === 'menu'} onClick={() => setTab('menu')}>Menyu</button>
          <button className="tab" aria-selected={tab === 'bill'} onClick={() => setTab('bill')}>Hisob</button>
        </div>
      </header>
    </>
  );
};
