import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, ShieldCheck, Printer, ArrowRight, Play, CheckCircle2, ShoppingBag, CreditCard, Layers } from 'lucide-react';
import { fetchPublicStats } from '../services/api';

export default function Hero({ onOpenDemo }) {
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [stats, setStats] = useState({ active_restaurants: 14, online_restaurants: 12, app_version: '0.3.0' });
  const [cartItems, setCartItems] = useState([
    { id: 1, name: 'Osh Palov (Lazer)', price: 45000, qty: 2 },
    { id: 2, name: 'Somsa Go\'shtli', price: 12000, qty: 4 },
    { id: 3, name: 'Ko\'k Choy', price: 5000, qty: 1 },
  ]);

  useEffect(() => {
    fetchPublicStats().then(setStats);
  }, []);

  const totalAmount = cartItems.reduce((acc, i) => acc + i.price * i.qty, 0);

  return (
    <section className="relative pt-10 sm:pt-16 pb-20 sm:pb-28 overflow-hidden oriental-pattern-overlay">
      {/* Optimized Floating Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[600px] h-[320px] sm:h-[400px] bg-[#e3c282]/10 blur-[120px] rounded-full pointer-events-none animate-float-slow" />
      <div className="absolute top-1/3 right-5 w-[250px] sm:w-[350px] h-[250px] sm:h-[350px] bg-[#adcdc3]/10 blur-[100px] rounded-full pointer-events-none animate-float-slow" style={{ animationDelay: '3.5s' }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 animate-fade-in-up">
        
        {/* Top Tag Badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full glass-card border border-[#e3c282]/40 text-[11px] sm:text-xs font-mono text-[#e3c282] shadow-md">
            <span className="w-2 h-2 rounded-full bg-[#e3c282] animate-pulse-ring" />
            <span>Hamroh POS — Restoranlar Uchun Ishonchli Kassa Tizimi</span>
          </div>
        </div>

        {/* Hero Title */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <h1 className="font-serif-display text-4xl sm:text-6xl font-bold tracking-tight text-gradient-gold leading-tight">
            Restoraningiz Har Qanday Sharoitda Ishlaydi. Internet Uzilsa Ham.
          </h1>

          <p className="text-lg sm:text-xl text-[#adcdc3] max-w-2xl mx-auto leading-relaxed">
            <strong className="text-white font-semibold">Hamroh POS</strong> — 100% offlayn kassa ishonchliligi, tezkor oshxona printerlari, xodimlar davomati va bulutli boshqaruvni o'z ichiga olgan zamonaviy restoran POS tizimi.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={onOpenDemo}
              className="w-full sm:w-auto btn-gold px-8 py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-3 shadow-xl"
            >
              <span>Demoga Bepul So'rov Berish</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <a
              href="#demo"
              className="w-full sm:w-auto btn-emerald px-8 py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current text-[#e3c282]" />
              <span>Interaktiv Demon ko'rish</span>
            </a>
          </div>

          {/* Trust Highlights */}
          <div className="pt-8 flex flex-wrap justify-center gap-6 text-xs text-[#adcdc3]/80 font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#e3c282]" />
              <span>Internet O'chganda Ham To'xtovsiz Kassa</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#e3c282]" />
              <span>Tezkor Oshxona Chek Printerlari</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#e3c282]" />
              <span>Xodimlarni PIN va Geolokatsiya Nazorati</span>
            </div>
          </div>
        </div>

        {/* Hero Interactive Terminal Mockup */}
        <div className="mt-16 max-w-5xl mx-auto">
          <div className="glass-card rounded-2xl p-4 sm:p-6 gold-border-glow shadow-2xl relative overflow-hidden">
            
            {/* Terminal Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#e3c282]/20">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="font-mono text-xs text-[#e3c282] font-semibold">
                  HAMROH POS — Kassa Oynasi (Stol VIP-03)
                </span>
              </div>

              {/* Online / Offline Simulator Toggle */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-[#adcdc3]">Tarmoq Holati:</span>
                <button
                  onClick={() => setIsOfflineMode(!isOfflineMode)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                    isOfflineMode
                      ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isOfflineMode ? (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>Internet Yo'q (Offlayn Ishlamoqda)</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Internet Bor (Sinxronlangan)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Terminal Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
              
              {/* Left Column: Product Selection Grid */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#e3c282]" />
                    <span>Menyu Toifalari</span>
                  </h3>
                  <span className="text-xs font-mono text-[#adcdc3]">Kassir: Sherzod M.</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: 'Osh Palov', price: '45,000 so\'m', cat: 'Milliy' },
                    { name: 'Shashlik (Mol)', price: '18,000 so\'m', cat: 'Kabab' },
                    { name: 'Somsa Go\'shtli', price: '12,000 so\'m', cat: 'Pishiriq' },
                    { name: 'Manti (5 dona)', price: '35,000 so\'m', cat: 'Milliy' },
                    { name: 'Salat Achchik-chuchuk', price: '15,000 so\'m', cat: 'Salatlar' },
                    { name: 'Ko\'k Choy', price: '5,000 so\'m', cat: 'Ichimlik' },
                  ].map((p, idx) => (
                    <div
                      key={idx}
                      className="glass-card p-3 rounded-xl hover:border-[#e3c282]/60 cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between"
                    >
                      <span className="text-xs font-semibold text-white truncate">{p.name}</span>
                      <span className="text-[11px] font-mono text-[#e3c282] mt-2">{p.price}</span>
                    </div>
                  ))}
                </div>

                {/* Status Notice inside Terminal */}
                <div className="p-3 rounded-xl bg-[#002019] border border-[#adcdc3]/20 flex items-center justify-between text-xs font-mono">
                  <span className="text-[#adcdc3]">Oshxona Printeri (TCP 9100):</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <Printer className="w-3.5 h-3.5" /> Tayyor (Xprinter XP-Q80A)
                  </span>
                </div>
              </div>

              {/* Right Column: Active Order Cart */}
              <div className="lg:col-span-5 glass-card p-4 rounded-xl flex flex-col justify-between space-y-4 border-[#e3c282]/30">
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-[#adcdc3]/10">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-[#e3c282]" />
                      Buyurtma Cheki #1042
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#e3c282]/20 text-[#e3c282]">
                      Jarayonda
                    </span>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs">
                        <span className="text-[#c7eade] truncate max-w-[140px]">
                          {item.qty}x {item.name}
                        </span>
                        <span className="font-mono text-[#e3c282]">
                          {(item.price * item.qty).toLocaleString()} so'm
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cart Totals & Checkout button */}
                <div className="pt-3 border-t border-[#e3c282]/20 space-y-3">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-white">Jami Summa:</span>
                    <span className="text-[#e3c282] font-mono text-base">
                      {totalAmount.toLocaleString()} so'm
                    </span>
                  </div>

                  <button className="w-full btn-gold py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>To'lovni Yopish va Chek Chop Etish</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
