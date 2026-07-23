import React, { useState } from 'react';
import { ShieldCheck, Menu, X, ChevronRight, PhoneCall, Sparkles } from 'lucide-react';

export default function Navbar({ onOpenDemo }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#001712]/80 border-b border-[#e3c282]/20 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo */}
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#e3c282] to-[#b89146] p-0.5 shadow-lg shadow-[#e3c282]/20 transition-transform group-hover:scale-105">
              <div className="w-full h-full bg-[#001712] rounded-[10px] flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-[#e3c282]" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-serif-display font-bold text-xl text-gradient-gold tracking-wide">
                Hamroh POS
              </span>
              <span className="text-[10px] text-[#adcdc3]/70 font-mono tracking-wider uppercase">
                Restoran Boshqaruv Tizimi
              </span>
            </div>
          </a>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[#c7eade]/80">
            <a href="#imkoniyatlar" className="hover:text-[#e3c282] transition-colors">
              Imkoniyatlar
            </a>
            <a href="#demo" className="hover:text-[#e3c282] transition-colors">
              Interaktiv Demo
            </a>
            <a href="#arxitektura" className="hover:text-[#e3c282] transition-colors">
              Ishlash Tartibi
            </a>
            <a href="#tariflar" className="hover:text-[#e3c282] transition-colors">
              Tariflar
            </a>
            <a href="#litsenziya" className="hover:text-[#e3c282] transition-colors flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#e3c282]" />
              Litsenziya
            </a>
          </div>

          {/* Right Action */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="tel:+998712000000"
              className="flex items-center gap-2 text-xs font-mono text-[#adcdc3] hover:text-[#e3c282] px-3 py-2 rounded-lg border border-[#adcdc3]/20 transition-all"
            >
              <PhoneCall className="w-3.5 h-3.5 text-[#e3c282]" />
              +998 71 200-00-00
            </a>
            <button
              onClick={onOpenDemo}
              className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
            >
              <span>Demoga So'rov</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg text-[#adcdc3] hover:text-[#e3c282] hover:bg-[#1a3a32]/40"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="md:hidden border-b border-[#e3c282]/20 bg-[#001712]/95 backdrop-blur-2xl px-4 pt-2 pb-6 space-y-3">
          <a
            href="#imkoniyatlar"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-lg text-base text-[#c7eade] hover:bg-[#1a3a32]/50 hover:text-[#e3c282]"
          >
            Imkoniyatlar
          </a>
          <a
            href="#demo"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-lg text-base text-[#c7eade] hover:bg-[#1a3a32]/50 hover:text-[#e3c282]"
          >
            Interaktiv Demo
          </a>
          <a
            href="#arxitektura"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-lg text-base text-[#c7eade] hover:bg-[#1a3a32]/50 hover:text-[#e3c282]"
          >
            Ishlash Tartibi
          </a>
          <a
            href="#tariflar"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-lg text-base text-[#c7eade] hover:bg-[#1a3a32]/50 hover:text-[#e3c282]"
          >
            Tariflar
          </a>
          <a
            href="#litsenziya"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 rounded-lg text-base text-[#c7eade] hover:bg-[#1a3a32]/50 hover:text-[#e3c282]"
          >
            Litsenziya Tekshirish
          </a>
          <div className="pt-2">
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenDemo();
              }}
              className="w-full btn-gold py-3 rounded-xl text-center font-semibold text-sm flex items-center justify-center gap-2"
            >
              <span>Demoga So'rov Berish</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
