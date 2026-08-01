import React, { useEffect, useState } from 'react';
import { QrApp } from './qr/QrApp';
import { LandingPage } from './landing/LandingPage';
import { IlovalarPage } from './ilovalar/IlovalarPage';

const SYSTEM_SUBDOMAINS = new Set(['admin', 'api', 'www', 'app', 'localhost', '127']);

/**
 * Bitta bundle IKKI xil kontekstda deploy qilinadi (repo-root CLAUDE.md +
 * docker-compose.prod.yml'lar): markazda hamrohpos.uz (marketing sayt) va
 * har bir restoranning o'z subdomenida (masalan sim-sim.hamrohpos.uz, o'sha
 * restoranning local_server'iga proxy qilingan nginx orqali). Ikkalasi ham
 * xuddi shu Docker image'dan quriladi — farq faqat qaysi hostname'ga qaysi
 * konteyner ulanganida (Cloudflare ingress) va nginx'ning BACKEND_WEB'ida.
 * Shu sababli qaror CLIENT-SIDE, hostname bo'yicha qabul qilinadi: agar
 * hostname `<nom>.hamrohpos.uz` ko'rinishida va `<nom>` tizim subdomeni
 * bo'lmasa — bu restoran, mijoz QR-menyuni ko'radi. `?demo=table` — dev/test
 * uchun hostname'siz shu rejimni majburlash imkoniyati (lokal localhost'da
 * subdomen bo'lmagani uchun).
 */
function useIsTenantSite() {
  const hostname = window.location.hostname.toLowerCase();
  const parts = hostname.split('.');
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === 'table') return true;
  if (parts.length < 3) return false;
  if (parts[parts.length - 2] !== 'hamrohpos' || parts[parts.length - 1] !== 'uz') return false;
  return !SYSTEM_SUBDOMAINS.has(parts[0]);
}

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

const App: React.FC = () => {
  const isTenantSite = useIsTenantSite();
  const path = usePath();

  if (isTenantSite) {
    return <QrApp />;
  }

  if (path === '/ilovalar' || path === '/ilovalar/') {
    return <IlovalarPage />;
  }

  return <LandingPage />;
};

export default App;
