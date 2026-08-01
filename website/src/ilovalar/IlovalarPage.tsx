import React, { useEffect, useState } from 'react';
import { fetchApps } from './api';
import { MOCK_APPS } from './mockData';
import { MobileAppEntry } from './types';

function dt(iso: string): string {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' })
      .formatToParts(new Date(iso)).reduce((a: Record<string, string>, x) => { a[x.type] = x.value; return a; }, {});
    return `${p.day}.${p.month}.${p.year}`;
  } catch {
    return '—';
  }
}

const PLATFORM_LABEL: Record<string, string> = { android: 'Android', windows: 'Windows' };
const DOWNLOAD_LABEL: Record<string, string> = { android: 'APK yuklab olish', windows: 'EXE yuklab olish' };

function platformLabel(p: string): string {
  return PLATFORM_LABEL[p] || p;
}

export const IlovalarPage: React.FC = () => {
  const [apps, setApps] = useState<MobileAppEntry[] | null>(null);
  const [live, setLive] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    fetchApps()
      .then((data) => setApps(data.length ? data : MOCK_APPS))
      .catch(() => { setApps(MOCK_APPS); setLive(false); });
  }, []);

  const newest = apps?.length
    ? apps.reduce((a, b) => (new Date(a.released_at) > new Date(b.released_at) ? a : b), apps[0])
    : null;

  const platforms = apps?.length
    ? [...new Set(apps.map((a) => a.platform))].sort().map(platformLabel)
    : [];
  const hasAndroid = apps?.some((a) => a.platform === 'android') ?? false;
  const hasWindows = apps?.some((a) => a.platform === 'windows') ?? false;

  return (
    <>
      <header className="nav">
        <div className="wrap nav__in">
          <a className="logo" href="/"><span className="logo__m">HamrohPOS</span><span className="logo__d"></span></a>
          <nav className="nav__links">
            <a href="/#imkoniyatlar">Imkoniyatlar</a>
            <a href="/#arxitektura">Arxitektura</a>
            <a href="/#narx">Narx</a>
            <a href="/ilovalar" aria-current="page">Ilovalar</a>
          </nav>
          <a className="btn btn--sm" href="/?demo=table" target="_blank" rel="noopener">QR ilova</a>
        </div>
      </header>

      <main className="wrap head">
        <div className="head__meta">
          <span className="eyebrow">Xodimlar uchun ilovalar{platforms.length ? ` · ${platforms.join(' · ')}` : ''}</span>
          <span className="eyebrow">
            {!live && 'Demo · backend ulanmagan · '}
            {newest ? `Oxirgi yangilanish · ${dt(newest.released_at)}` : '—'}
          </span>
        </div>
        <div className="ilovalar-board"><split-flap theme="board" text="ILOVALAR" auto step={56}></split-flap></div>
        <div className="head__grid">
          <p className="lede">Manager, kassir va ofitsiant ilovalarining oxirgi versiyalari. Mobil dasturchi yangi versiya chiqarganda ro'yxat shu yerda avtomatik yangilanadi.</p>
          <div className="stat">
            <div className="dblk"><div className="lbl">Ilovalar</div><div className="dblk__v">{apps ? String(apps.length).padStart(2, '0') : '—'}</div></div>
            <div className="dblk"><div className="lbl">Platforma</div><div className="dblk__v">{platforms.length ? platforms.join(' / ') : '—'}</div></div>
            <div className="dblk"><div className="lbl">Kanal</div><div className="dblk__v">Barqaror</div></div>
          </div>
        </div>

        <div className="thead"><span>№</span><span>Ilova</span><span>Versiya · Chiqarilgan</span><span>Hajmi</span><span>Min. OS</span><span>Yuklab olish</span></div>
        <div>
          {!apps && <div className="spin">Ro'yxat yuklanmoqda</div>}
          {apps && apps.map((a, i) => {
            const open = openRow === a.slug;
            return (
              <div className="row" key={a.slug} data-open={open || undefined}>
                <div className="row__n">{String(i + 1).padStart(2, '0')}</div>
                <div>
                  <div className="row__t">{a.name}</div>
                  <div className="lbl row__r">{a.role}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {a === newest && <span className="badge badge--new">Yangi</span>}
                    {a.is_required && <span className="badge badge--req">Majburiy</span>}
                  </div>
                </div>
                <div>
                  <div className="row__v"><split-flap mode="num" text={a.version} step={46}></split-flap></div>
                  <div className="lbl" style={{ marginTop: 6 }}>{dt(a.released_at)}</div>
                  <button className="togg" style={{ marginTop: 9 }} onClick={() => setOpenRow(open ? null : a.slug)}>
                    {open ? 'Yopish' : 'Nima yangilandi'}
                  </button>
                </div>
                <div className="row__d">{a.size_mb} MB</div>
                <div className="row__d">{a.min_os || '—'}</div>
                <div className="row__dl">
                  <a className="btn btn--sm btn--sig" href={a.download_url} download>{DOWNLOAD_LABEL[a.platform] || 'Yuklab olish'}</a>
                  <span className="lbl">v{a.version} · {platformLabel(a.platform)}</span>
                </div>
                <div className="notes"><ul>{(a.notes || []).map((n, ni) => <li key={ni}>{n}</li>)}</ul></div>
              </div>
            );
          })}
        </div>

        <div className="two">
          <div>
            <h3 className="h3" style={{ marginBottom: 14 }}>O'rnatish talablari</h3>
            <table className="spec">
              <tbody>
                {hasAndroid && <tr><th>Android</th><td>Android 8.0+ · APK to'g'ridan-to'g'ri o'rnatiladi (Play Store shart emas)</td></tr>}
                {hasWindows && <tr><th>Windows</th><td>Windows 10/11 64-bit · EXE o'rnatuvchi to'g'ridan-to'g'ri ishga tushiriladi</td></tr>}
                <tr><th>Tarmoq</th><td>Restoran Wi-Fi/LAN tarmog'i — ilova lokal serverni o'zi topadi (mDNS)</td></tr>
                <tr><th>Offline</th><td>Ulanish uzilsa ilova lokal serverga yozishda davom etadi</td></tr>
                <tr><th>Kirish</th><td>Xodim PIN kodi · huquqlar bulutdan boshqariladi</td></tr>
                <tr><th>Yangilanish</th><td>Ilova ochilganda yangi versiyani o'zi tekshiradi va shu sahifadan yuklaydi</td></tr>
              </tbody>
            </table>
          </div>
          <aside className="side">
            <span className="eyebrow eyebrow--sig">Qo'llanma</span>
            <h3 className="h3" style={{ margin: '10px 0 4px' }}>Qanday o'rnatiladi</h3>
            {hasWindows && !hasAndroid ? (
              <ol>
                <li>Kompyuterdan shu sahifani oching va kerakli ilovani yuklab oling.</li>
                <li>Windows "Himoyalandi" ogohlantirsa, "Batafsil" → "Baribir ishga tushirish"ni tanlang.</li>
                <li>O'rnatuvchini ishga tushiring va restoran tarmog'iga ulaning.</li>
                <li>Xodim PIN kodi bilan kiring — qolgani avtomatik sozlanadi.</li>
              </ol>
            ) : (
              <ol>
                <li>Telefondan shu sahifani oching va kerakli ilovani yuklab oling.</li>
                <li>Android so'raganda "Noma'lum manbalarga ruxsat" ni yoqing.</li>
                <li>APK ni o'rnating va restoran Wi-Fi tarmog'iga ulaning.</li>
                <li>Xodim PIN kodi bilan kiring — qolgani avtomatik sozlanadi.</li>
              </ol>
            )}
            {hasAndroid && hasWindows && (
              <p className="lede" style={{ fontSize: 13, marginTop: 14 }}>
                Windows uchun: o'rnatuvchini yuklab, "Himoyalandi" ogohlantirsa "Batafsil" → "Baribir ishga tushirish"ni tanlang.
              </p>
            )}
          </aside>
        </div>
      </main>

      <footer className="foot"><div className="wrap foot__bot">
        <span className="lbl">© 2026 HamrohPOS</span>
        <span className="lbl">Asia/Tashkent</span>
        <span className="lbl"><a href="/" style={{ border: 0 }}>hamrohpos.uz</a></span>
      </div></footer>
    </>
  );
};
