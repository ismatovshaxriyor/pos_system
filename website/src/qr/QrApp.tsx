import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { MenuView } from './components/MenuView';
import { BillView } from './components/BillView';
import { ItemSheet } from './components/ItemSheet';
import { CallWaiterFab, CallWaiterToast } from './components/CallWaiter';

/** Keng ekranda, mustaqil `/table/<uuid>/` sahifasida (modal ichida emas)
 *  ilovani telefon ramkasi ichida ko'rsatadi. Modal ichida (`standalone=false`,
 *  masalan landing sahifadagi "Demo ko'rish") kerak emas — `.phone__d` o'zi
 *  allaqachon jismoniy ramka beradi, ikkinchi marta ramkalash keraksiz. */
function useDeviceFrame(standalone: boolean) {
  const embedded = window.self !== window.top;
  const [fullscreen, setFullscreen] = useState(false);
  const [wide, setWide] = useState(window.innerWidth >= 680 && window.innerHeight >= 620);

  useEffect(() => {
    if (!standalone || embedded) return;
    const onResize = () => setWide(window.innerWidth >= 680 && window.innerHeight >= 620);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [standalone, embedded]);

  const framed = standalone && !embedded && !fullscreen && wide;

  useEffect(() => {
    document.body.classList.toggle('framed', framed);
    return () => document.body.classList.remove('framed');
  }, [framed]);

  return { showFsBtn: framed, onFullscreen: () => setFullscreen(true) };
}

const QrAppContent: React.FC<{ standalone: boolean }> = ({ standalone }) => {
  const { tab } = useApp();
  const { showFsBtn, onFullscreen } = useDeviceFrame(standalone);

  return (
    <>
      {showFsBtn && (
        <button className="btn btn--sm" id="fsBtn" style={{ display: 'inline-flex' }} onClick={onFullscreen}>
          To'liq ekran
        </button>
      )}
      <div id="app">
        <Header />
        <div className="scr">
          <section className="view" hidden={tab !== 'menu'}><MenuView /></section>
          <section className="view" hidden={tab !== 'bill'}><BillView /></section>
        </div>
        <CallWaiterFab />
        <ItemSheet />
        <CallWaiterToast />
      </div>
    </>
  );
};

/** `standalone=true` (standart) — `/table/<uuid>/` sahifasida to'liq ekran.
 *  `standalone=false` — landing sahifadagi demo modal ichida, kichik telefon
 *  ramkasi ichiga joylashtirilganda. */
export const QrApp: React.FC<{ standalone?: boolean }> = ({ standalone = true }) => (
  <AppProvider>
    <QrAppContent standalone={standalone} />
  </AppProvider>
);
