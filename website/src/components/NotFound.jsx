import React from 'react';
import { Home, ArrowLeft, ShieldCheck, HelpCircle } from 'lucide-react';

export default function NotFound({ onGoHome }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A1F44] px-4 py-16 oriental-pattern-overlay relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0077CC]/10 blur-[130px] rounded-full pointer-events-none animate-float-slow" />

      <div className="max-w-md w-full glass-card p-8 sm:p-10 rounded-3xl gold-border-glow text-center space-y-6 relative z-10 border-[#0077CC]/40">
        
        {/* Logo badge */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0077CC] to-[#005A96] p-0.5 shadow-xl mx-auto">
          <div className="w-full h-full bg-[#0A1F44] rounded-[14px] flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-[#0077CC]" />
          </div>
        </div>

        {/* 404 Error Code */}
        <div className="space-y-2">
          <h1 className="font-serif-display text-7xl font-bold text-gradient-gold tracking-tight">
            404
          </h1>
          <h2 className="font-serif-display text-xl font-bold text-white">
            Sahifa Topilmadi
          </h2>
          <p className="text-xs text-[#5C9FD6] leading-relaxed font-mono">
            Siz qidirgan sahifa mavjud emas, manzil noto'g'ri kiritilgan yoki boshqa joyga ko'chirilgan.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="pt-4 space-y-3">
          <button
            onClick={onGoHome}
            className="w-full btn-gold py-3.5 rounded-xl text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 shadow-lg"
          >
            <Home className="w-4 h-4" />
            <span>Bosh Sahifaga Qaytish</span>
          </button>
        </div>

        <div className="pt-2 text-[10px] font-mono text-[#5C9FD6]/60">
          Rasmiy Server: hamrohpos.uz — POS System Cloud HQ
        </div>
      </div>
    </div>
  );
}
