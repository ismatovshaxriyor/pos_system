import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { DemoModal } from './DemoModal';
import { LeadModal } from './LeadModal';
import { LicenseCheck } from './LicenseCheck';
import { KassaDemo } from './KassaDemo';
import { Pricing } from './Pricing';
import { useScrollReveal } from './useScrollReveal';

// three.js bitta kutubxona bo'lsa ham asosiy JS to'plamining ko'p qismini
// tashkil qiladi (~500KB) - dastlabki sahifa yuklanishini kutmasin, faqat
// shu komponent render bo'lganda alohida chunk sifatida yuklansin.
const Hero3D = lazy(() => import('./Hero3D').then((m) => ({ default: m.Hero3D })));

const TICK = [
  'Offline rejimda ishlaydi', '<b>Ona-Bola</b> arxitekturasi', 'QR menyu va jonli hisob',
  'Oshxona displeyi', 'Smenali kassa hisoboti', 'Chek printeri integratsiyasi',
  '<b>Asia/Tashkent</b>', 'Navbatli sinxronizatsiya',
];

const FEATURES: [string, string, string, string][] = [
  ['01', "Internetsiz ishlaydigan kassa", "Internet uzilsa ham savdo to'xtamaydi — lokal server buyurtmani qabul qiladi va navbatga qo'yadi.", 'Lokal server'],
  ['02', 'Ona-Bola sinxronizatsiya', 'Restoran serveri bulut bilan avtomatik moslashadi; ulanish tiklanganda navbat ketma-ket yuboriladi.', 'Bulut'],
  ['03', 'QR menyu va hisob', "Mijoz stoldagi QR orqali menyuni va joriy hisobni real vaqtda ko'radi. To'lov xodim orqali.", 'Mijoz'],
  ['04', 'Oshxona displeyi', "Buyurtma bosilgach oshxonaga darhol yetadi; taom holati zalga jonli qaytadi.", 'Oshxona'],
  ['05', 'Chek va hisobot', 'Chek printeri, smenali kassa hisoboti, kunlik va oylik savdo ko‘rsatkichlari.', 'Hisobot'],
  ['06', "Ko'p filial", "Bitta bulutdan barcha filial: menyu, narx, xodim huquqlari va umumiy hisobot.", 'Tarmoq'],
];

function useLoadingScreen() {
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('hp_loaded') === '1');
  const [out, setOut] = useState(hidden);
  useEffect(() => {
    if (hidden) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setHidden(true); return; }
    document.documentElement.style.overflow = 'hidden';
    const t1 = setTimeout(() => {
      setOut(true);
      document.documentElement.style.overflow = '';
      sessionStorage.setItem('hp_loaded', '1');
    }, 1500);
    return () => clearTimeout(t1);
  }, [hidden]);
  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => setHidden(true), 400);
    return () => clearTimeout(t);
  }, [out]);
  return { hidden, out };
}

export const LandingPage: React.FC = () => {
  const { hidden: loadHidden, out: loadOut } = useLoadingScreen();
  const [demoOpen, setDemoOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const secRef = useScrollReveal();
  const tickerText = TICK.concat(TICK).map((t, i) => (
    <span key={i} dangerouslySetInnerHTML={{ __html: t }} />
  ));

  return (
    <div ref={secRef}>
      {!loadHidden && (
        <div className={`load${loadOut ? ' out' : ''}`}>
          <div>
            <split-flap className="load__in" theme="board" text="HAMROHPOS" pad={9} step={52}></split-flap>
            <div className="lbl" style={{ textAlign: 'center', marginTop: 14 }}>Yuklanmoqda</div>
          </div>
        </div>
      )}

      <header className="nav">
        <div className="wrap nav__in">
          <a className="logo" href="#top"><span className="logo__m">HamrohPOS</span><span className="logo__d"></span></a>
          <nav className="nav__links">
            <a href="#imkoniyatlar">Imkoniyatlar</a>
            <a href="#demo">Kassa demosi</a>
            <a href="#arxitektura">Arxitektura</a>
            <a href="#narx">Narx</a>
            <a href="#litsenziya">Litsenziya</a>
            <a href="/ilovalar">Ilovalar</a>
          </nav>
          <div className="nav__r">
            <button className="btn btn--sm" onClick={() => setDemoOpen(true)}>QR ilova</button>
            <button className="btn btn--sm btn--sig" onClick={() => setDemoOpen(true)}>Demo ko'rish</button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="wrap hero">
          <div className="hero__meta">
            <span className="eyebrow">Internetsiz ishlaydigan POS · Restoran va kafelar uchun</span>
            <span className="eyebrow">Toshkent · hamrohpos.uz</span>
          </div>
          <div className="board">
            <split-flap theme="board" text="INTERNETSIZ" auto step={58}></split-flap>
            <split-flap theme="bare" text="ISHLAYDI" auto step={58}></split-flap>
          </div>
          <div className="hero__grid">
            <div>
              <p className="lede">Internet uzilsa ham kassa to'xtamaydi. Restoran ichidagi lokal server buyurtmani qabul qiladi va saqlaydi, ulanish tiklanganda bulut bilan o'zi sinxronlanadi.</p>
              <div className="hero__cta">
                <button className="btn btn--sig" onClick={() => setDemoOpen(true)}>Demo ko'rish</button>
                <a className="btn" href="#narx">Narxni kelishish</a>
              </div>
              <div className="hero__facts">
                <div className="dblk"><div className="lbl">Rejim</div><div className="dblk__v">Offline</div></div>
                <div className="dblk"><div className="lbl">Server</div><div className="dblk__v">Lokal + Bulut</div></div>
                <div className="dblk"><div className="lbl">Mijoz</div><div className="dblk__v">QR</div></div>
              </div>
            </div>
            <Suspense fallback={<div id="hero3d" />}>
              <Hero3D />
            </Suspense>
          </div>
        </section>

        <div className="ticker"><div className="ticker__t">{tickerText}</div></div>

        <section className="wrap sec" id="imkoniyatlar">
          <div className="sec__head">
            <span className="sec__num">01</span>
            <h2 className="h2">Imkoniyatlar</h2>
            <span className="eyebrow" style={{ marginLeft: 'auto' }}>Olti modul · bitta tizim</span>
          </div>
          <div className="ftable">
            {FEATURES.map(([n, t, d, k]) => (
              <div className="frow" key={n} data-rv="">
                <div className="frow__n">{n}</div>
                <div className="frow__t">{t}</div>
                <div className="frow__d">{d}</div>
                <div className="frow__k">{k}</div>
              </div>
            ))}
          </div>
        </section>

        <KassaDemo />

        <section className="wrap sec" id="arxitektura">
          <div className="sec__head">
            <span className="sec__num">03</span>
            <h2 className="h2">Ona-Bola arxitekturasi</h2>
            <span className="eyebrow" style={{ marginLeft: 'auto' }}>Sxema 02</span>
          </div>
          <div className="arch">
            <div className="node">
              <span className="eyebrow eyebrow--sig">Ona</span>
              <div className="node__t">Bulut</div>
              <div className="lbl">hamrohpos.uz</div>
              <ul>
                <li>Barcha filial ma'lumoti</li>
                <li>Menyu va narx boshqaruvi</li>
                <li>Konsolidatsiyalangan hisobot</li>
                <li>Litsenziya nazorati</li>
              </ul>
            </div>
            <div className="node node--mid">
              <span className="eyebrow eyebrow--sig">Bola</span>
              <div className="node__t">Lokal server</div>
              <div className="lbl">Restoran ichida · LAN</div>
              <ul>
                <li>Buyurtma va to'lov yozuvi</li>
                <li>Navbatli sinxronizatsiya</li>
                <li>QR public API</li>
                <li>Internetsiz to'liq ishlaydi</li>
              </ul>
            </div>
            <div className="node">
              <span className="eyebrow">Uchinchi qatlam</span>
              <div className="node__t">Terminallar</div>
              <div className="lbl">Zal · Oshxona · Mijoz</div>
              <ul>
                <li>Kassa (ofitsiant/kassir)</li>
                <li>Oshxona displeyi</li>
                <li>QR menyu va hisob</li>
                <li>Chek printeri</li>
              </ul>
            </div>
          </div>
          <table className="spec">
            <tbody>
              <tr><th>Ulanish uzilganda</th><td>Lokal server buyurtmani qabul qilishda davom etadi; yozuvlar navbatga tushadi.</td></tr>
              <tr><th>Tiklanganda</th><td>Navbat bulutga ketma-ket yuboriladi, konflikt vaqt belgisi bo'yicha hal qilinadi.</td></tr>
              <tr><th>Mijoz kanali</th><td>QR orqali faqat ko'rish: menyu, joriy hisob va ofitsiant chaqiruvi</td></tr>
              <tr><th>Vaqt zonasi</th><td>Asia/Tashkent · barcha hisobot va chek shu zonada</td></tr>
            </tbody>
          </table>
        </section>

        <Pricing onCta={() => setLeadOpen(true)} />

        <LicenseCheck />

        <section className="endcta">
          <div className="wrap" style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 'var(--gut)', alignItems: 'end' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--signal)' }}>Keyingi qadam</span>
              <h2 className="h2" style={{ margin: '10px 0 14px' }}>Restoraningizni<br />ko'chiring</h2>
              <p className="lede">Demo ko'rsatuv 20 daqiqa. Mavjud menyu va stol jadvalingizni ko'chirishga biz yordam beramiz.</p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn--sig" onClick={() => setDemoOpen(true)}>Demo ko'rish</button>
              <button className="btn" onClick={() => setLeadOpen(true)}>Bog'lanish</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot__cols">
            <div>
              <div className="logo" style={{ marginBottom: 12 }}><span className="logo__m">HamrohPOS</span><span className="logo__d"></span></div>
              <p className="lede" style={{ fontSize: 14 }}>Restoranlar uchun savdo tizimi — internetsiz ham ishlaydi. Ona-Bola arxitekturasi: bulut boshqaruvi, restoran ichida mustaqil ishlaydigan lokal server.</p>
            </div>
            <div>
              <h4>Mahsulot</h4>
              <ul>
                <li><a href="#imkoniyatlar">Imkoniyatlar</a></li>
                <li><a href="#demo">Kassa displeyi</a></li>
                <li><a href="#arxitektura">Arxitektura</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); setDemoOpen(true); }}>QR menyu</a></li>
              </ul>
            </div>
            <div>
              <h4>Xizmat</h4>
              <ul>
                <li><a href="#narx">Narx</a></li>
                <li><a href="#litsenziya">Litsenziya</a></li>
                <li><a href="/ilovalar">Ilovalar</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); setLeadOpen(true); }}>Qo'llab-quvvatlash</a></li>
              </ul>
            </div>
            <div>
              <h4>Aloqa</h4>
              <ul>
                <li><a href="tel:+998900000000">+998 90 000 00 00</a></li>
                <li><a href="mailto:info@hamrohpos.uz">info@hamrohpos.uz</a></li>
                <li><a href="https://hamrohpos.uz">hamrohpos.uz</a></li>
                <li><a href="#">Toshkent, O'zbekiston</a></li>
              </ul>
            </div>
          </div>
          <div className="foot__bot">
            <span className="lbl">© 2026 HamrohPOS</span>
            <span className="lbl">Asia/Tashkent · Narxlar so'mda</span>
            <span className="lbl">Shveytsariya tartibi · v1.0</span>
          </div>
        </div>
      </footer>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      <LeadModal open={leadOpen} onClose={() => setLeadOpen(false)} />
    </div>
  );
};
