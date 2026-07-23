import React from 'react';
import { Server, Database, ShieldCheck, Cpu, ArrowRightLeft, WifiOff, Lock, RefreshCw, KeyRound } from 'lucide-react';

export default function Architecture() {
  return (
    <section id="arxitektura" className="py-24 relative overflow-hidden bg-[#001712] oriental-pattern-overlay">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="text-xs font-mono text-[#e3c282] uppercase tracking-widest px-3 py-1 rounded-full border border-[#e3c282]/30 bg-[#e3c282]/10">
            Arxitekturava Xavfsizlik
          </span>
          <h2 className="font-serif-display text-3xl sm:text-5xl font-bold text-gradient-gold">
            Ona-Bola (Cloud-Local) Tamoyili Qanday Ishlaydi?
          </h2>
          <p className="text-[#adcdc3] text-base">
            Markaziy bulut server hamda restoranning lokal kompyuteri o'rtasidagi ikki tomonlama offlayn va xavfsiz sinxronizatsiya zanjiri.
          </p>
        </div>

        {/* Architecture Visual Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* BOLA (Local Server) Card */}
          <div className="lg:col-span-5 glass-card p-8 rounded-2xl border-[#e3c282]/30 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-[#e3c282]/20 flex items-center justify-center border border-[#e3c282]">
                  <Cpu className="w-6 h-6 text-[#e3c282]" />
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-500/40">
                  Lokal Restoran (Bola)
                </span>
              </div>

              <h3 className="text-xl font-bold text-white font-serif-display">
                Bola Server (Mini PC / Laptop)
              </h3>

              <p className="text-xs text-[#adcdc3]/90 leading-relaxed">
                Restoran ichida jismoniy joylashgan Mini PC yoki NUC qurilmasi. Kunlik barcha buyurtmalar, stollar, printerlar va xodimlarni 100% offlayn rejimda boshqaradi.
              </p>

              <div className="space-y-2.5 pt-2 text-xs font-mono text-[#c7eade]">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-[#e3c282]" />
                  <span>Internet yo'qligida 30 kunlik avtonom ishlash</span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#e3c282]" />
                  <span>RS256 Public Key bilan tokenlarni offlayn tekshirish</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#e3c282]" />
                  <span>Lokal PostgreSQL / SQLite + Redis & Daphne ASGI</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#002019] border border-[#adcdc3]/20 text-[11px] font-mono text-[#adcdc3]">
              📍 Qurilma Barmoq Izi: <span className="text-white">DMI Product UUID / MAC Address</span>
            </div>
          </div>

          {/* SYNC & SECURITY BRIDGE (Middle) */}
          <div className="lg:col-span-2 flex flex-col items-center justify-center space-y-4 py-6">
            <div className="w-14 h-14 rounded-full glass-card border border-[#e3c282] flex items-center justify-center text-[#e3c282] gold-border-glow animate-pulse">
              <ArrowRightLeft className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1 font-mono text-xs">
              <span className="text-[#e3c282] font-bold block">HTTPS / TLS</span>
              <span className="text-[#adcdc3] text-[10px] block">Heartbeat 60s</span>
              <span className="text-[#adcdc3] text-[10px] block">RS256 JWT Auth</span>
            </div>
          </div>

          {/* ONA (Cloud Server) Card */}
          <div className="lg:col-span-5 glass-card p-8 rounded-2xl border-[#e3c282]/30 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-[#adcdc3]/20 flex items-center justify-center border border-[#adcdc3]">
                  <Server className="w-6 h-6 text-[#adcdc3]" />
                </div>
                <span className="text-xs font-mono text-[#e3c282] bg-[#e3c282]/10 px-3 py-1 rounded-full border border-[#e3c282]/30">
                  Markaziy Cloud (Ona)
                </span>
              </div>

              <h3 className="text-xl font-bold text-white font-serif-display">
                Ona Server (hamrohpos.uz)
              </h3>

              <p className="text-xs text-[#adcdc3]/90 leading-relaxed">
                Yagona markaziy bulut serveri. RS256 kalitlari orqali litsenziyalar yaratadi, metrikalarni qabul qiladi hamda masofaviy komandalar va dastur yangilanishlarini tarqatadi.
              </p>

              <div className="space-y-2.5 pt-2 text-xs font-mono text-[#c7eade]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#e3c282]" />
                  <span>Faqat Ona serverda saqlanuvchi RS256 Private Key</span>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#e3c282]" />
                  <span>Watchtower orqali avtomatik dastur versiyalari rollout'i</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#e3c282]" />
                  <span>ErrorLog va SyncedOrder sotuv tahlillarini to'plash</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#002019] border border-[#adcdc3]/20 text-[11px] font-mono text-[#adcdc3]">
              🌐 Rasmiy Domen: <span className="text-[#e3c282] font-bold">https://hamrohpos.uz</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
