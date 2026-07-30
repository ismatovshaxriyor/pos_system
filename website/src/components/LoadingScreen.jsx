import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0A1F44] oriental-pattern-overlay animate-fadeIn">
      {/* Glow Effects */}
      <div className="absolute w-72 h-72 bg-[#0077CC]/10 blur-[100px] rounded-full pointer-events-none animate-pulse-ring" />

      {/* Animated Logo Container */}
      <div className="relative z-10 flex flex-col items-center space-y-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0077CC] to-[#005A96] p-0.5 shadow-2xl shadow-[#0077CC]/30 animate-float-slow">
          <div className="w-full h-full bg-[#0A1F44] rounded-[14px] flex items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-[#0077CC]" />
          </div>
        </div>

        <div className="text-center space-y-2 font-mono">
          <h1 className="font-serif-display text-2xl font-bold text-gradient-gold tracking-wide">
            Hamroh POS
          </h1>
          <div className="flex items-center justify-center gap-2 text-xs text-[#5C9FD6]">
            <Sparkles className="w-3.5 h-3.5 text-[#0077CC] animate-spin" />
            <span>Tizim yuklanmoqda... (hamrohpos.uz)</span>
          </div>
        </div>

        {/* Loading Progress Bar */}
        <div className="w-48 h-1.5 rounded-full bg-[#0F2A5C] border border-[#0077CC]/30 overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-[#0077CC] to-[#5C9FD6] rounded-full animate-laser-scan" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}
