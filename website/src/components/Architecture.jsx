import React from 'react';
import { Server, Database, ShieldCheck, Cpu, ArrowRightLeft, WifiOff, Lock, RefreshCw, KeyRound } from 'lucide-react';

export default function Architecture() {
  return (
    <section id="arxitektura" className="py-24 relative overflow-hidden bg-[#0A1F44] oriental-pattern-overlay">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="text-xs font-mono text-[#0077CC] uppercase tracking-widest px-3 py-1 rounded-full border border-[#0077CC]/30 bg-[#0077CC]/10">
            Tizim Ishlash Tartibi va Xavfsizlik
          </span>
          <h2 className="font-serif-display text-3xl sm:text-5xl font-bold text-gradient-gold">
            Hamroh POS Tizimi Qanday Ishlaydi?
          </h2>
          <p className="text-[#5C9FD6] text-base">
            Restoraningizdagi kassa va markaziy boshqaruv o'rtasidagi to'liq xavfsiz va uzluksiz aloqa.
          </p>
        </div>

        {/* Architecture Visual Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Restoran Kassa Tizimi Card */}
          <div className="lg:col-span-5 glass-card p-8 rounded-2xl border-[#0077CC]/30 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-[#0077CC]/20 flex items-center justify-center border border-[#0077CC]">
                  <Cpu className="w-6 h-6 text-[#0077CC]" />
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-500/40">
                  Restoran Kassa Tizimi
                </span>
              </div>

              <h3 className="text-xl font-bold text-white font-serif-display">
                Restoran Ichidagi Kassa
              </h3>

              <p className="text-xs text-[#5C9FD6]/90 leading-relaxed">
                Restoran ichida joylashgan kompyuter yoki kassa monobloki. Barcha buyurtmalar, stollar, printerlar va xodimlarni internet bo'lmasa ham 100% to'xtovsiz boshqaradi.
              </p>

              <div className="space-y-2.5 pt-2 text-xs font-mono text-[#FFFFFF]">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-[#0077CC]" />
                  <span>Internet o'chganda ham to'xtovsiz ishlash</span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#0077CC]" />
                  <span>Har qanday sharoitda ma'lumotlar yo'qolmasligi</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#0077CC]" />
                  <span>Soniyalarda tez va silliq javob berish</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0F2A5C] border border-[#5C9FD6]/20 text-[11px] font-mono text-[#5C9FD6]">
              📍 Ishonchli Kirish: <span className="text-white">Faqat ruxsat berilgan kassa qurilmasi</span>
            </div>
          </div>

          {/* SYNC & SECURITY BRIDGE (Middle) */}
          <div className="lg:col-span-2 flex flex-col items-center justify-center space-y-4 py-6">
            <div className="w-14 h-14 rounded-full glass-card border border-[#0077CC] flex items-center justify-center text-[#0077CC] gold-border-glow animate-pulse">
              <ArrowRightLeft className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1 font-mono text-xs">
              <span className="text-[#0077CC] font-bold block">Xavfsiz Bog'lanish</span>
              <span className="text-[#5C9FD6] text-[10px] block">Avtomatik Saqlash</span>
              <span className="text-[#5C9FD6] text-[10px] block">Litsenziya Nazorati</span>
            </div>
          </div>

          {/* ONA (Cloud Server) Card */}
          <div className="lg:col-span-5 glass-card p-8 rounded-2xl border-[#0077CC]/30 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-[#5C9FD6]/20 flex items-center justify-center border border-[#5C9FD6]">
                  <Server className="w-6 h-6 text-[#5C9FD6]" />
                </div>
                <span className="text-xs font-mono text-[#0077CC] bg-[#0077CC]/10 px-3 py-1 rounded-full border border-[#0077CC]/30">
                  Markaziy Bulut Boshqaruvi
                </span>
              </div>

              <h3 className="text-xl font-bold text-white font-serif-display">
                Masofaviy Boshqaruv (hamrohpos.uz)
              </h3>

              <p className="text-xs text-[#5C9FD6]/90 leading-relaxed">
                Yagona markaziy bulut tizimi. Barcha filiallar litsenziyalari, sotuv statistikasi, kunlik tushumlar va dastur yangilanishlarini masofadan boshqaradi.
              </p>

              <div className="space-y-2.5 pt-2 text-xs font-mono text-[#FFFFFF]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#0077CC]" />
                  <span>100% xavfsiz va ma'lumotlar daxlsizligi</span>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#0077CC]" />
                  <span>Tizimni yangilash va masofadan boshqarish</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0077CC]" />
                  <span>Barcha filiallar sotuv hisoboti va tahlili</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0F2A5C] border border-[#5C9FD6]/20 text-[11px] font-mono text-[#5C9FD6]">
              🌐 Markaziy Sayt: <span className="text-[#0077CC] font-bold">https://hamrohpos.uz</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
