import React from 'react';
import { ShieldCheck, Mail, Phone, MapPin, Globe } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#00100d] border-t border-[#e3c282]/20 pt-16 pb-8 font-mono text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-[#adcdc3]/10">
          
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#e3c282] to-[#b89146] p-0.5">
                <div className="w-full h-full bg-[#001712] rounded-[10px] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-[#e3c282]" />
                </div>
              </div>
              <span className="font-serif-display font-bold text-lg text-gradient-gold">
                Hamroh POS
              </span>
            </div>

            <p className="text-[#adcdc3]/80 leading-relaxed text-[11px]">
              Restoran va qahvaxonalar uchun internet bo'lmasada to'xtamaydigan, ishonchli kassa va masofaviy boshqaruv tizimi.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-[#e3c282] font-bold uppercase text-xs">Navigatsiya</h4>
            <ul className="space-y-2 text-[#adcdc3]/80">
              <li><a href="#imkoniyatlar" className="hover:text-[#e3c282]">Imkoniyatlar</a></li>
              <li><a href="#demo" className="hover:text-[#e3c282]">Interaktiv Demo</a></li>
              <li><a href="#arxitektura" className="hover:text-[#e3c282]">Ishlash Tartibi</a></li>
              <li><a href="#tariflar" className="hover:text-[#e3c282]">Tariflar va Narxlar</a></li>
              <li><a href="#litsenziya" className="hover:text-[#e3c282]">Litsenziyani Tekshirish</a></li>
            </ul>
          </div>

          {/* Docs & API */}
          <div className="space-y-3">
            <h4 className="text-[#e3c282] font-bold uppercase text-xs">Qo'llanma & Ma'lumot</h4>
            <ul className="space-y-2 text-[#adcdc3]/80">
              <li><a href="#arxitektura" className="hover:text-[#e3c282]">Litsenziya va Xavfsizlik</a></li>
              <li><a href="#imkoniyatlar" className="hover:text-[#e3c282]">Oshxona Printerlarini Ulash</a></li>
              <li><a href="#imkoniyatlar" className="hover:text-[#e3c282]">Xodimlarning Davomati Nazorati</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <h4 className="text-[#e3c282] font-bold uppercase text-xs">Bog'lanish</h4>
            <div className="space-y-2 text-[#adcdc3]/80 text-[11px]">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#e3c282]" />
                <span>+998 71 200-00-00</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#e3c282]" />
                <span>info@hamrohpos.uz</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[#e3c282]" />
                <span>https://hamrohpos.uz</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#e3c282]" />
                <span>Toshkent shahri, IT Park HQ</span>
              </div>
            </div>
          </div>

        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[#adcdc3]/60 text-[10px]">
          <span>© 2026 Hamroh POS (hamrohpos.uz). Barcha huquqlar himoyalangan.</span>
          <span className="mt-2 sm:mt-0 font-mono">Hamroh POS Restoran Tizimi</span>
        </div>
      </div>
    </footer>
  );
}
