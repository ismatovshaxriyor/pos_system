import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { MenuView } from './components/MenuView';
import { BillView } from './components/BillView';
import { ItemSheet } from './components/ItemSheet';
import { CallWaiterFab, CallWaiterToast } from './components/CallWaiter';

/** Keng ekranda (masalan HamrohPOS.html'dagi demo modaldan tashqarida,
 *  to'g'ridan-to'g'ri ochilganda) ilovani telefon ramkasi ichida ko'rsatadi —
 *  restoran egasiga demo ko'rsatishda qulay. iframe ichida (landing sahifadagi
 *  demo oynasida) ramka chizilmaydi, chunki u allaqachon telefon shaklida. */
function useDeviceFrame() {
  const embedded = window.self !== window.top;
  const [fullscreen, setFullscreen] = useState(false);
  const [wide, setWide] = useState(window.innerWidth >= 680 && window.innerHeight >= 620);

  useEffect(() => {
    if (embedded) return;
    const onResize = () => setWide(window.innerWidth >= 680 && window.innerHeight >= 620);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [embedded]);

  const framed = !embedded && !fullscreen && wide;

  useEffect(() => {
    document.body.classList.toggle('framed', framed);
    return () => document.body.classList.remove('framed');
  }, [framed]);

  return { showFsBtn: framed, onFullscreen: () => setFullscreen(true) };
}

const AppContent: React.FC = () => {
  const { tab } = useApp();
  const { showFsBtn, onFullscreen } = useDeviceFrame();

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

const App: React.FC = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export default App;
