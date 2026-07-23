import React, { useState } from 'react';
import { X, CheckCircle2, Phone, Building, User, Send, ShieldCheck } from 'lucide-react';
import { sendDemoRequest } from '../services/api';

export default function DemoModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    restaurantName: '',
    contactName: '',
    phone: '+998 ',
    branchCount: '1 ta kassa'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await sendDemoRequest(formData);
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const handleResetAndClose = () => {
    setIsSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001712]/80 backdrop-blur-md animate-fadeIn">
      <div className="glass-card rounded-3xl max-w-lg w-full p-6 sm:p-8 gold-border-glow relative border-[#e3c282]/50 shadow-2xl">
        
        {/* Close Button */}
        <button
          onClick={handleResetAndClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-[#adcdc3] hover:text-[#e3c282] hover:bg-[#1a3a32]/50 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {!isSubmitted ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e3c282]/10 border border-[#e3c282]/30 text-xs font-mono text-[#e3c282]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Hamroh POS Demoga Bepul So'rov</span>
              </div>
              <h3 className="font-serif-display text-2xl font-bold text-gradient-gold">
                Tizimni Restoraningizda Sinab Ko'ring
              </h3>
              <p className="text-xs text-[#adcdc3]">
                Ma'lumotlaringizni qoldiring va biz restoraningizga mos offlayn kassa paketini ko'rsatib beramiz.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-[#e3c282]">Restoran / Qahvaxona Nomi:</label>
                <div className="relative">
                  <Building className="w-4 h-4 text-[#adcdc3] absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Rayhon National Food"
                    value={formData.restaurantName}
                    onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                    className="w-full bg-[#001712] border border-[#adcdc3]/30 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-[#adcdc3]/40 focus:outline-none focus:border-[#e3c282]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#e3c282]">Mas'ul Shaxs Ismi:</label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#adcdc3] absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Jasur Rahimov"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full bg-[#001712] border border-[#adcdc3]/30 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-[#adcdc3]/40 focus:outline-none focus:border-[#e3c282]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#e3c282]">Telefon Raqamingiz:</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#adcdc3] absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-[#001712] border border-[#adcdc3]/30 rounded-xl pl-9 pr-4 py-2.5 text-white focus:outline-none focus:border-[#e3c282]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#e3c282]">Kassa va Filiallar Soni:</label>
                <select
                  value={formData.branchCount}
                  onChange={(e) => setFormData({ ...formData, branchCount: e.target.value })}
                  className="w-full bg-[#001712] border border-[#adcdc3]/30 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#e3c282]"
                >
                  <option value="1 ta kassa">1 ta kassa (Kichik kafe/oshxona)</option>
                  <option value="2-5 ta kassa">2-5 ta kassa (O'rta restoran)</option>
                  <option value="5+ ta kassa / Tarmoq">5+ ta kassa / Tarmoq (Ko'p filialli)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full btn-gold py-3.5 rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 mt-4 text-xs shadow-xl"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Yuborilmoqda...' : 'So\'rovni Yuborish'}</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="py-8 text-center space-y-4 font-mono animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="font-serif-display text-2xl font-bold text-gradient-gold">
              Rahmat! So'rovingiz Qabul Qilindi
            </h3>

            <p className="text-xs text-[#adcdc3] max-w-sm mx-auto leading-relaxed">
              Mutaxassisimiz <strong className="text-white">15 daqiqa ichida</strong> ko'rsatilgan telefon raqamingiz bo'yicha bog'lanadi va sizga hamrohpos.uz demosini ko'rsatib beradi.
            </p>

            <button
              onClick={handleResetAndClose}
              className="btn-gold px-8 py-3 rounded-xl text-xs font-bold"
            >
              Yopish
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
