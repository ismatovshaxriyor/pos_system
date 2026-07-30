import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const SplitBillModal: React.FC = () => {
  const { isSplitBillModalOpen, setIsSplitBillModalOpen, totalUZS, showToast, tableName } = useApp();
  const [splitCount, setSplitCount] = useState(2);

  if (!isSplitBillModalOpen) return null;

  const perPersonAmount = Math.round(totalUZS / splitCount);

  const handleConfirmSplit = () => {
    showToast(`Bill split into ${splitCount} parts of ${perPersonAmount.toLocaleString()} UZS`);
    setIsSplitBillModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0A1F44]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-md w-full rounded-2xl p-6 sm:p-8 border border-[#0077CC]/40 shadow-2xl">
        <button
          onClick={() => setIsSplitBillModalOpen(false)}
          className="absolute top-5 right-5 text-[#9FB0C4] hover:text-[#0077CC] p-2 rounded-full hover:bg-[#0F2A5C] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <span className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
          CHECK CALCULATOR
        </span>
        <h2 className="font-serif-display font-bold text-2xl text-[#FFFFFF] mb-2">
          Split Bill
        </h2>
        <p className="font-sans-body text-xs text-[#9FB0C4] mb-6">
          Divide {tableName} total among your party guests.
        </p>

        {/* Counter */}
        <div className="bg-[#050D1D] p-4 rounded-xl border border-[#0077CC]/20 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-sans-body text-xs text-[#9FB0C4]">NUMBER OF PEOPLE</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSplitCount((c) => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg bg-[#0F2A5C] text-[#0077CC] font-bold flex items-center justify-center"
              >
                -
              </button>
              <span className="font-serif-display font-bold text-lg text-[#FFFFFF] w-6 text-center">
                {splitCount}
              </span>
              <button
                onClick={() => setSplitCount((c) => Math.min(12, c + 1))}
                className="w-8 h-8 rounded-lg bg-[#0F2A5C] text-[#0077CC] font-bold flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <div className="border-t border-[#0077CC]/15 pt-3 flex justify-between items-center">
            <span className="font-sans-body text-xs font-bold text-[#0077CC] uppercase">AMOUNT PER PERSON</span>
            <span className="font-serif-display font-bold text-xl text-[#0077CC]">
              {perPersonAmount.toLocaleString()} UZS
            </span>
          </div>
        </div>

        <button
          onClick={handleConfirmSplit}
          className="w-full bg-[#0077CC] text-white font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#4DA6E0] transition-colors uppercase"
        >
          CONFIRM SPLIT
        </button>
      </div>
    </div>
  );
};
