import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const EmirChamberModal: React.FC = () => {
  const { isEmirChamberModalOpen, setIsEmirChamberModalOpen, showToast } = useApp();
  const [guestCount, setGuestCount] = useState(4);
  const [time, setTime] = useState('21:00');

  if (!isEmirChamberModalOpen) return null;

  const handleReserve = () => {
    showToast(`Private Dining request sent for ${guestCount} guests at ${time}`);
    setIsEmirChamberModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-[#0A1F44]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-lg w-full rounded-2xl p-6 sm:p-8 border border-[#0077CC]/40 shadow-2xl">
        <button
          onClick={() => setIsEmirChamberModalOpen(false)}
          className="absolute top-5 right-5 text-[#9FB0C4] hover:text-[#0077CC] p-2 rounded-full hover:bg-[#0F2A5C] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <span className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] uppercase block mb-2">
          PRIVATE DINING
        </span>
        <h2 className="font-serif-display font-bold text-2xl sm:text-3xl text-[#FFFFFF] mb-3">
          The Emir's Chamber
        </h2>
        <p className="font-sans-body text-xs text-[#9FB0C4] mb-6">
          An exclusive sanctuary secluded behind carved walnut doors with dedicated sommelier service.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="font-sans-body text-[10px] font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
              NUMBER OF GUESTS
            </label>
            <div className="flex items-center gap-3 bg-[#050D1D] p-2.5 rounded-xl border border-[#0077CC]/20">
              <button
                onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                className="w-8 h-8 rounded-lg bg-[#0F2A5C] text-[#0077CC] flex items-center justify-center font-bold"
              >
                -
              </button>
              <span className="font-serif-display font-bold text-lg text-[#FFFFFF] flex-1 text-center">
                {guestCount} Guests
              </span>
              <button
                onClick={() => setGuestCount((g) => Math.min(16, g + 1))}
                className="w-8 h-8 rounded-lg bg-[#0F2A5C] text-[#0077CC] flex items-center justify-center font-bold"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="font-sans-body text-[10px] font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
              RESERVATION TIME
            </label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-[#050D1D] text-[#FFFFFF] p-3 rounded-xl border border-[#0077CC]/20 font-sans-body text-xs focus:outline-none focus:border-[#0077CC]"
            >
              <option value="19:00">19:00 PM</option>
              <option value="20:00">20:00 PM</option>
              <option value="21:00">21:00 PM</option>
              <option value="22:00">22:00 PM</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleReserve}
          className="w-full bg-[#0077CC] text-white font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#4DA6E0] transition-colors uppercase"
        >
          REQUEST PRIVATE RESERVATION
        </button>
      </div>
    </div>
  );
};
