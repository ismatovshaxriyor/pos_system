import React, { useState } from 'react';
import { ShoppingCart, UtensilsCrossed, Monitor, CheckCircle, AlertTriangle, RefreshCw, Plus, Minus, CreditCard, Receipt, Server } from 'lucide-react';

export default function InteractiveDemo() {
  const [activeTab, setActiveTab] = useState('kassa'); // 'kassa' | 'oshxona' | 'cloud'
  
  // Kassa State
  const [selectedTable, setSelectedTable] = useState('Zal Stol #04');
  const [items, setItems] = useState([
    { id: 1, name: 'Osh Palov (Lazer)', price: 45000, qty: 1 },
    { id: 2, name: 'Choy Ko\'k', price: 5000, qty: 2 },
  ]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isSuccessToast, setIsSuccessToast] = useState(false);

  // Oshxona State
  const [kitchenJobs, setKitchenJobs] = useState([
    { id: 'JOB-901', table: 'VIP Stol #02', items: ['2x Somsa Go\'shtli', '1x Choy'], printer: 'Asosiy Printer (TCP 9100)', status: 'Kutilmoqda' },
    { id: 'JOB-902', table: 'Zal Stol #04', items: ['1x Osh Palov', '2x Ko\'k choy'], printer: 'Milliy Oqituvchi Printer', status: 'Tayyorlanmoqda' }
  ]);

  // Handlers for Kassa
  const handleAddItem = (product) => {
    const existing = items.find(i => i.id === product.id);
    if (existing) {
      setItems(items.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setItems([...items, { ...product, qty: 1 }]);
    }
  };

  const handleUpdateQty = (id, delta) => {
    setItems(items.map(i => {
      if (i.id === id) {
        const newQty = i.qty + delta;
        return newQty > 0 ? { ...i, qty: newQty } : i;
      }
      return i;
    }));
  };

  const totalSum = items.reduce((acc, i) => acc + i.price * i.qty, 0);

  const handleCheckout = () => {
    setIsSuccessToast(true);
    setTimeout(() => setIsSuccessToast(false), 3000);
  };

  const handleKitchenStatus = (jobId) => {
    setKitchenJobs(kitchenJobs.map(j => {
      if (j.id === jobId) {
        return { ...j, status: j.status === 'Kutilmoqda' ? 'Tayyorlanmoqda' : 'Chop etildi' };
      }
      return j;
    }));
  };

  return (
    <section id="demo" className="py-24 relative overflow-hidden oriental-pattern-overlay">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <span className="text-xs font-mono text-[#e3c282] uppercase tracking-widest px-3 py-1 rounded-full border border-[#e3c282]/30 bg-[#e3c282]/10">
            Jonli Tizim Ekranlari
          </span>
          <h2 className="font-serif-display text-3xl sm:text-5xl font-bold text-gradient-gold">
            Hamroh POS'ni Ekranda Sinab Ko'ring
          </h2>
          <p className="text-[#adcdc3] text-base">
            Quyidagi tablarni bosing va Kassa, Oshxona hamda Cloud Admin paneli interfeyslari bilan tanishing.
          </p>
        </div>

        {/* Mobile-Friendly Touch-Scrollable Tab Buttons */}
        <div className="flex justify-start sm:justify-center mb-8 overflow-x-auto hide-scrollbar pb-2 px-2">
          <div className="inline-flex p-1.5 rounded-xl glass-card border border-[#e3c282]/30 gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab('kassa')}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-xs font-semibold font-mono whitespace-nowrap transition-all duration-200 ${
                activeTab === 'kassa'
                  ? 'btn-gold shadow-md scale-[1.02]'
                  : 'text-[#adcdc3] hover:text-white hover:bg-[#e3c282]/10'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>1. Kassa Terminali</span>
            </button>

            <button
              onClick={() => setActiveTab('oshxona')}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-xs font-semibold font-mono whitespace-nowrap transition-all duration-200 ${
                activeTab === 'oshxona'
                  ? 'btn-gold shadow-md scale-[1.02]'
                  : 'text-[#adcdc3] hover:text-white hover:bg-[#e3c282]/10'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>2. Oshxona Monitoringi</span>
            </button>

            <button
              onClick={() => setActiveTab('cloud')}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-xs font-semibold font-mono whitespace-nowrap transition-all duration-200 ${
                activeTab === 'cloud'
                  ? 'btn-gold shadow-md scale-[1.02]'
                  : 'text-[#adcdc3] hover:text-white hover:bg-[#e3c282]/10'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>3. Cloud Ona Admin</span>
            </button>
          </div>
        </div>

        {/* Interactive Demo View Area */}
        <div className="glass-card rounded-2xl p-6 gold-border-glow shadow-2xl min-h-[500px]">
          
          {/* TAB 1: KASSA TERMINALI */}
          {activeTab === 'kassa' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Tables & Menu */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Tables bar */}
                <div>
                  <h4 className="text-xs font-mono text-[#e3c282] uppercase mb-2">Stol Tanlash:</h4>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {['Zal Stol #01', 'Zal Stol #04', 'VIP Xona #02', 'Ko\'cha Shoshle #07'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setSelectedTable(t)}
                        className={`px-3 py-2 rounded-lg text-xs font-mono border transition-all ${
                          selectedTable === t
                            ? 'bg-[#e3c282]/20 border-[#e3c282] text-white font-bold'
                            : 'glass-card border-[#adcdc3]/20 text-[#adcdc3] hover:border-[#e3c282]/40'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product Catalog */}
                <div>
                  <h4 className="text-xs font-mono text-[#e3c282] uppercase mb-2">Taomlar Katalogi:</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { id: 1, name: 'Osh Palov (Lazer)', price: 45000 },
                      { id: 2, name: 'Choy Ko\'k', price: 5000 },
                      { id: 3, name: 'Shashlik Gijduvon', price: 22000 },
                      { id: 4, name: 'Lag\'mon Qo\'y go\'shtli', price: 38000 },
                      { id: 5, name: 'Somsa Tandoor', price: 14000 },
                      { id: 6, name: 'Salat Sveji', price: 16000 },
                    ].map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleAddItem(p)}
                        className="glass-card p-3.5 rounded-xl hover:border-[#e3c282] cursor-pointer transition-all flex flex-col justify-between"
                      >
                        <span className="text-xs font-bold text-white">{p.name}</span>
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-xs font-mono text-[#e3c282]">{p.price.toLocaleString()} so'm</span>
                          <span className="w-5 h-5 rounded bg-[#e3c282]/20 flex items-center justify-center text-[#e3c282] text-xs font-bold">+</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Column: Order Checkout */}
              <div className="lg:col-span-4 glass-card p-5 rounded-xl flex flex-col justify-between border-[#e3c282]/40 space-y-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-[#adcdc3]/10 pb-3">
                    <span className="text-xs font-bold text-white font-mono">{selectedTable}</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                      Faol Buyurtma
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-48 overflow-y-auto">
                    {items.map((i) => (
                      <div key={i.id} className="flex items-center justify-between text-xs glass-card p-2 rounded-lg">
                        <span className="text-white font-medium truncate max-w-[120px]">{i.name}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleUpdateQty(i.id, -1)} className="p-1 rounded bg-[#001712] text-[#e3c282]">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-white font-bold">{i.qty}</span>
                          <button onClick={() => handleAddItem(i)} className="p-1 rounded bg-[#001712] text-[#e3c282]">
                            <Plus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-[#e3c282] ml-2">{(i.price * i.qty).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-[#e3c282]/20">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-white">Jami Summa:</span>
                    <span className="text-[#e3c282] font-mono">{totalSum.toLocaleString()} so'm</span>
                  </div>

                  {/* Payment Type Selection */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPaymentMethod('cash')}
                      className={`py-1.5 text-xs font-mono rounded border ${
                        paymentMethod === 'cash' ? 'bg-[#e3c282]/20 border-[#e3c282] text-white' : 'glass-card border-transparent text-[#adcdc3]'
                      }`}
                    >
                      Naqd Pul
                    </button>
                    <button
                      onClick={() => setPaymentMethod('card')}
                      className={`py-1.5 text-xs font-mono rounded border ${
                        paymentMethod === 'card' ? 'bg-[#e3c282]/20 border-[#e3c282] text-white' : 'glass-card border-transparent text-[#adcdc3]'
                      }`}
                    >
                      Plastik Karta
                    </button>
                  </div>

                  <button
                    onClick={handleCheckout}
                    className="w-full btn-gold py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>To'lovni Yopish & Chek Chop Etish</span>
                  </button>

                  {isSuccessToast && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-mono text-center animate-pulse">
                      ✓ Buyurtma yopildi va ESC/POS printerga yuborildi!
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: OSHXONA MONITORINGI */}
          {activeTab === 'oshxona' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-[#adcdc3]/10">
                <div>
                  <h3 className="text-lg font-bold text-white font-serif-display">Kitchen Display System (KDS)</h3>
                  <p className="text-xs text-[#adcdc3]">Oshpaz va barmanlar uchun tayyorlanayotgan taomlar biletlari navbati</p>
                </div>
                <span className="text-xs font-mono text-[#e3c282] bg-[#e3c282]/10 px-3 py-1.5 rounded-lg border border-[#e3c282]/30">
                  Printer: TCP 9100 Xprinter Active
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {kitchenJobs.map((job) => (
                  <div key={job.id} className="glass-card p-5 rounded-xl border-[#e3c282]/30 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs text-[#e3c282] font-bold">{job.id} — {job.table}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        job.status === 'Chop etildi' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      }`}>
                        {job.status}
                      </span>
                    </div>

                    <div className="space-y-1.5 bg-[#001712]/60 p-3 rounded-lg border border-[#adcdc3]/10 text-xs font-mono text-[#c7eade]">
                      {job.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#e3c282]" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[11px] font-mono text-[#adcdc3]">{job.printer}</span>
                      <button
                        onClick={() => handleKitchenStatus(job.id)}
                        className="btn-emerald px-4 py-1.5 rounded-lg text-xs font-mono"
                      >
                        {job.status === 'Kutilmoqda' ? 'Tayyorlashni boshlash' : 'Chop etildi deb belgilash'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CLOUD ONA ADMIN */}
          {activeTab === 'cloud' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-[#adcdc3]/10">
                <div>
                  <h3 className="text-lg font-bold text-white font-serif-display">Ona Cloud Admin Panel (hamrohpos.uz)</h3>
                  <p className="text-xs text-[#adcdc3]">Barcha restoranlar, litsenziyalar va xatolar jurnali markaziy nazorati</p>
                </div>
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono text-emerald-400">Cloud Online (v0.3.0)</span>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card p-4 rounded-xl space-y-1">
                  <span className="text-[11px] font-mono text-[#adcdc3]">Faol Restoranlar:</span>
                  <div className="text-2xl font-bold text-white font-mono">14 ta Bola</div>
                </div>
                <div className="glass-card p-4 rounded-xl space-y-1">
                  <span className="text-[11px] font-mono text-[#adcdc3]">Litsenziya Holati:</span>
                  <div className="text-2xl font-bold text-[#e3c282] font-mono">100% RS256 JWT</div>
                </div>
                <div className="glass-card p-4 rounded-xl space-y-1">
                  <span className="text-[11px] font-mono text-[#adcdc3]">Xatolar Jurnali:</span>
                  <div className="text-2xl font-bold text-emerald-400 font-mono">0 Ochiq Xato</div>
                </div>
              </div>

              {/* Sample Fleet list */}
              <div className="glass-card p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-mono text-[#e3c282] uppercase">Ulanib Turgan Restoranlar Floti:</h4>
                <div className="space-y-2 text-xs font-mono">
                  {[
                    { name: 'Afsona Restaurant (Toshkent)', ver: 'v0.3.0', status: 'ONLAYN', expire: '2026-08-31' },
                    { name: 'Rayhon National Food (Samarqand)', ver: 'v0.3.0', status: 'ONLAYN', expire: '2026-09-15' },
                    { name: 'Choyxona #1 (Farg\'ona)', ver: 'v0.2.9', status: 'OFLAYN (Cache Active)', expire: '2026-08-10' },
                  ].map((r, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg bg-[#001712]/50 border border-[#adcdc3]/10">
                      <span className="text-white font-semibold">{r.name}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-[#adcdc3]">{r.ver}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          r.status.includes('ONLAYN') ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'
                        }`}>
                          {r.status}
                        </span>
                        <span className="text-[#e3c282]">{r.expire}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
}
