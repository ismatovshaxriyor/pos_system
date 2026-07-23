import React from 'react';
import { ShieldCheck, Printer, Smartphone, CloudSync, Zap, CreditCard, Lock, Cpu, Clock } from 'lucide-react';

export default function Features() {
  const featuresList = [
    {
      icon: ShieldCheck,
      title: "100% Offlayn Ishonchlilik (RS256 JWT)",
      desc: "Internet haftalab uzilib qolsa ham kassa to'xtamaydi. Ona serverdan olingan pre-issued RS256 JWT tokenlar to'plami mahalliy ravishda offlayn tekshiriladi.",
      tag: "Arxitektura"
    },
    {
      icon: Printer,
      title: "Oshxona Printerlari (ESC/POS TCP 9100)",
      desc: "Taom toifalari bo'yicha (Milliy, Kabab, Bar) tegishli chek printerlariga avtomatik yo'naltirish va Uzbek-Latin CP866 qo'llab-quvvatlash.",
      tag: "Oshxona"
    },
    {
      icon: Smartphone,
      title: "PIN-Kod va Qurilma Identifikatsiyasi",
      desc: "Xodimlar faqat menejer tasdiqlagan qurilma va 6 xonali PIN bilan tizimga kiradi. Noqonuniy kirishlar va qurilmalarni bir zumda bloklash imkoniyati.",
      tag: "Xavfsizlik"
    },
    {
      icon: CloudSync,
      title: "Ona Cloud Markaziy Boshqaruv",
      desc: "hamrohpos.uz domeni orqali barcha filiallar metrikalari (CPU/RAM, tushumlar, sotuv statistikasi) va masofaviy komandalar (Update, Block).",
      tag: "Bulut"
    },
    {
      icon: Zap,
      title: "Real-Vaqt WebSocket Pushes",
      desc: "Daphne/Channels va WebSocket orqali stollar holati, narxlar va oshxona buyurtmalari kassa va planchetlar o'rtasida soniyada yangilanadi.",
      tag: "Tezkorlik"
    },
    {
      icon: CreditCard,
      title: "Split Payments & Qarz Daftari",
      desc: "Bitta buyurtmani naqd va karta aralash to'lash, doimiy mijozlar uchun qarz daftari va menejer tasdig'i bilan chegirmalar berish.",
      tag: "Moliya"
    }
  ];

  return (
    <section id="imkoniyatlar" className="py-24 relative overflow-hidden bg-[#001712]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="text-xs font-mono text-[#e3c282] uppercase tracking-widest px-3 py-1 rounded-full border border-[#e3c282]/30 bg-[#e3c282]/10">
            Nega Aynan Hamroh POS?
          </span>
          <h2 className="font-serif-display text-3xl sm:text-5xl font-bold text-gradient-gold">
            Restoraningiz Silliq va Uzluksiz Ishlashi Uchun Barcha Imkoniyatlar
          </h2>
          <p className="text-[#adcdc3] text-base leading-relaxed">
            Biz oddiy kassa dasturi emas, offlayn chidamlilik va bulutli nazoratni birlashtirgan mukammal POS tizimni taqdim etamiz.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuresList.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className="glass-card glass-card-hover p-8 rounded-2xl flex flex-col justify-between space-y-4 border-[#e3c282]/20"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#e3c282]/20 to-[#adcdc3]/10 flex items-center justify-center border border-[#e3c282]/40">
                      <Icon className="w-6 h-6 text-[#e3c282]" />
                    </div>
                    <span className="text-[10px] font-mono text-[#e3c282] bg-[#e3c282]/10 px-2.5 py-1 rounded-md border border-[#e3c282]/20">
                      {f.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white font-serif-display">
                    {f.title}
                  </h3>

                  <p className="text-xs text-[#adcdc3]/80 leading-relaxed">
                    {f.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#adcdc3]/10 flex items-center text-xs font-mono text-[#e3c282]">
                  <span>Batafsil ko'rish</span>
                  <span className="ml-1">→</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
