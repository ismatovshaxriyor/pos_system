import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const SplitBillModal: React.FC = () => {
  const { isSplitBillModalOpen, setIsSplitBillModalOpen, totalUZS, showToast } = useApp();
  const [splitCount, setSplitCount] = useState(2);

  if (!isSplitBillModalOpen) return null;

  const perPersonAmount = Math.round(totalUZS / splitCount);

  const handleConfirmSplit = () => {
    showToast(`Bill split into ${splitCount} parts of ${perPersonAmount.toLocaleString()} UZS`);
    setIsSplitBillModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#001712]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-md w-full rounded-2xl p-6 sm:p-8 border border-[#E3C282]/40 shadow-2xl">
        <button
          onClick={() => setIsSplitBillModalOpen(false)}
          className="absolute top-5 right-5 text-[#C1C8C4] hover:text-[#E3C282] p-2 rounded-full hover:bg-[#0F2D26] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <span className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] uppercase block mb-1">
          CHECK CALCULATOR
        </span>
        <h2 className="font-serif-display font-bold text-2xl text-[#C7EADE] mb-2">
          Split Bill
        </h2>
        <p className="font-sans-body text-xs text-[#C1C8C4] mb-6">
          Divide Table 12 total among your party guests.
        </p>

        {/* Counter */}
        <div className="bg-[#00110D] p-4 rounded-xl border border-[#E3C282]/20 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-sans-body text-xs text-[#C1C8C4]">NUMBER OF PEOPLE</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSplitCount((c) => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg bg-[#0F2D26] text-[#E3C282] font-bold flex items-center justify-center"
              >
                -
              </button>
              <span className="font-serif-display font-bold text-lg text-[#C7EADE] w-6 text-center">
                {splitCount}
              </span>
              <button
                onClick={() => setSplitCount((c) => Math.min(12, c + 1))}
                className="w-8 h-8 rounded-lg bg-[#0F2D26] text-[#E3C282] font-bold flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <div className="border-t border-[#E3C282]/15 pt-3 flex justify-between items-center">
            <span className="font-sans-body text-xs font-bold text-[#E3C282] uppercase">AMOUNT PER PERSON</span>
            <span className="font-serif-display font-bold text-xl text-[#E3C282]">
              {perPersonAmount.toLocaleString()} UZS
            </span>
          </div>
        </div>

        <button
          onClick={handleConfirmSplit}
          className="w-full bg-[#E3C282] text-[#001712] font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#FFDEA0] transition-colors uppercase"
        >
          CONFIRM SPLIT
        </button>
      </div>
    </div>
  );
};
