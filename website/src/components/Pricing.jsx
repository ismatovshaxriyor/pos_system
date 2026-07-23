import React, { useState } from 'react';
import { Check, Sparkles, HelpCircle } from 'lucide-react';

export default function Pricing({ onOpenDemo }) {
  const [isAnnual, setIsAnnual] = useState(true);

  const plans = [
    {
      name: "Boshlang'ich (Standard)",
      priceMonthly: "290,000",
      priceAnnual: "230,000",
      desc: "Kichik qahvaxona va kafelar uchun mukammal offlayn kassa yechimi.",
      features: [
        "1 ta Kassa Terminali",
        "100% Offlayn va Ishonchli Kassa",
        "Oshxona va Bar Chek Printerlari",
        "Xodimlarning PIN-kod bilan kirishi",
        "Stollar va taomlar toifalari boshqaruvi",
        "Lokal Z-Hisobot va sotuv tarixi",
        "Standard Texnik Qo'llab-quvvatlash"
      ],
      isPopular: false,
      btnText: "Standard'ni Tanlash"
    },
    {
      name: "Biznes (Pro)",
      priceMonthly: "490,000",
      priceAnnual: "390,000",
      desc: "O'rta va katta restoranlar uchun markaziy bulutli boshqaruv.",
      features: [
        "Cheksiz Kassa va Afitsiantlar",
        "hamrohpos.uz Bulutli Server Sinxronizatsiyasi",
        "Telegram Boshqaruv Bot Xabarnomalari",
        "Qarz Daftari va Aralash To'lovlar (Naqd/Karta)",
        "Geolokatsiya Bo'yicha Xodimlari Davomati",
        "Real-Vaqt Jonli Stollar Xaritasi",
        "24/7 VIP Ustuvor Qo'llab-quvvatlash"
      ],
      isPopular: true,
      btnText: "Biznes Planini Boshlash"
    },
    {
      name: "Enterprise (Tarmoqlar)",
      priceMonthly: "Kelishilgan",
      priceAnnual: "Kelishilgan",
      desc: "Ko'p filialli restoran tarmoqlari va maxsus integratsiyalar uchun.",
      features: [
        "Ko'p filialli Yagona Cloud Dashboard",
        "Shaxsiy Serverga (Private Cloud) O'rnatib Berish",
        "Telegram va ERP/1C Maxsus Integratsiyalar",
        "Alohida Shaxsiy Texnik Injinering",
        "SLA 99.9% Kafiga Ega Xizmat Ko'rsatish"
      ],
      isPopular: false,
      btnText: "Bog'lanish va Maslahat"
    }
  ];

  return (
    <section id="tariflar" className="py-24 relative overflow-hidden bg-[#001712]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <span className="text-xs font-mono text-[#e3c282] uppercase tracking-widest px-3 py-1 rounded-full border border-[#e3c282]/30 bg-[#e3c282]/10">
            Shaffof va Qulay Narxlar
          </span>
          <h2 className="font-serif-display text-3xl sm:text-5xl font-bold text-gradient-gold">
            Restoraningiz Hajmiga Mos Tarifni Tanlang
          </h2>
          <p className="text-[#adcdc3] text-base">
            Yillik to'lovda <strong className="text-white">20% chegirma</strong> va bepul o'rnatib berish xizmati taqdim etiladi.
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="pt-6 flex justify-center items-center gap-4">
            <span className={`text-xs font-mono font-semibold ${!isAnnual ? 'text-[#e3c282]' : 'text-[#adcdc3]'}`}>
              Oylik To'lov
            </span>

            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="w-14 h-8 rounded-full glass-card border border-[#e3c282] p-1 transition-all flex items-center"
            >
              <div
                className={`w-6 h-6 rounded-full bg-gradient-to-r from-[#e3c282] to-[#b89146] transition-transform ${
                  isAnnual ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>

            <span className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${isAnnual ? 'text-[#e3c282]' : 'text-[#adcdc3]'}`}>
              <span>Yillik To'lov</span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                20% Chegirma
              </span>
            </span>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {plans.map((p, idx) => (
            <div
              key={idx}
              className={`glass-card glass-card-hover p-8 rounded-2xl flex flex-col justify-between space-y-6 relative transition-all ${
                p.isPopular
                  ? 'gradient-border-gold gold-border-glow bg-gradient-to-b from-[#1a3a32]/80 to-[#001712]/95 transform md:-translate-y-2'
                  : 'border-[#e3c282]/20 hover:border-[#e3c282]/60'
              }`}
            >
              {p.isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full btn-gold text-[11px] font-bold font-mono tracking-wider flex items-center gap-1 shadow-lg">
                  <Sparkles className="w-3.5 h-3.5 text-[#001712] animate-pulse" />
                  <span>ENG OMMABOP TARIF</span>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white font-serif-display">
                  {p.name}
                </h3>

                <p className="text-xs text-[#adcdc3]/80 leading-relaxed min-h-[36px]">
                  {p.desc}
                </p>

                {/* Price Display */}
                <div className="pt-2 pb-4 border-b border-[#adcdc3]/10">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-bold text-gradient-gold font-mono">
                      {isAnnual ? p.priceAnnual : p.priceMonthly}
                    </span>
                    {p.priceMonthly !== 'Kelishilgan' && (
                      <span className="text-xs font-mono text-[#adcdc3]">so'm / oyiga</span>
                    )}
                  </div>
                </div>

                {/* Feature List */}
                <div className="space-y-2.5 pt-2">
                  {p.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-2.5 text-xs text-[#c7eade]">
                      <Check className="w-4 h-4 text-[#e3c282] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4">
                <button
                  onClick={onOpenDemo}
                  className={`w-full py-3.5 rounded-xl text-xs font-bold font-mono tracking-wider transition-all ${
                    p.isPopular
                      ? 'btn-gold shadow-xl'
                      : 'btn-emerald'
                  }`}
                >
                  {p.btnText}
                </button>
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
