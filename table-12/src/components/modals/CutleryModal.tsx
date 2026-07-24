import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const CutleryModal: React.FC = () => {
  const { isCutleryModalOpen, setIsCutleryModalOpen, callWaiter, t } = useApp();

  const [selectedItems, setSelectedItems] = useState<string[]>(['Fresh Napkins']);

  const items = [
    { id: 'Forks & Knives', label: t.cutleryForksKnives || 'Forks & Knives', icon: 'flatware' },
    { id: 'Soup Spoons', label: t.cutlerySpoons || 'Soup Spoons', icon: 'soup_kitchen' },
    { id: 'Fresh Napkins', label: t.cutleryNapkins || 'Textile Fresh Napkins', icon: 'dry_cleaning' },
    { id: 'Extra Plates', label: t.cutleryPlates || 'Extra Sharing Plates', icon: 'dinner_dining' },
    { id: 'Hot Towels', label: t.cutleryHotTowels || 'Warm Osh Towels (Osh Oshi)', icon: 'clean_hands' },
    { id: 'Toothpicks', label: t.cutleryToothpicks || 'Toothpicks & Mint', icon: 'spa' },
  ];

  if (!isCutleryModalOpen) return null;

  const toggleItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleRequest = () => {
    const list = selectedItems.length > 0 ? selectedItems.join(', ') : 'Extra cutlery';
    callWaiter(`Qoʻshimcha Idishlar Soʻrovi: ${list}`);
    setIsCutleryModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#001712]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-md w-full rounded-2xl p-6 sm:p-8 border border-[#E3C282]/40 shadow-2xl">
        <button
          onClick={() => setIsCutleryModalOpen(false)}
          className="absolute top-5 right-5 text-[#C1C8C4] hover:text-[#E3C282] p-2 rounded-full hover:bg-[#0F2D26] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <span className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] uppercase block mb-1">
          {t.tableService || 'TABLE SERVICE'}
        </span>
        <h2 className="font-serif-display font-bold text-2xl text-[#C7EADE] mb-2">
          {t.requestCutleryTitle || 'Request Extra Cutlery'}
        </h2>
        <p className="font-sans-body text-xs text-[#C1C8C4] mb-6">
          {t.requestCutlerySub || 'Select what you require and our server will bring them immediately.'}
        </p>

        <div className="grid grid-cols-1 gap-2.5 mb-6">
          {items.map((item) => {
            const isSelected = selectedItems.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
                  isSelected
                    ? 'border-[#E3C282] bg-[#E3C282]/15 text-[#E3C282]'
                    : 'border-[#E3C282]/20 text-[#C1C8C4] hover:border-[#E3C282]/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  <span className="font-sans-body text-xs font-semibold">{item.label}</span>
                </div>
                {isSelected && <span className="material-symbols-outlined text-sm text-[#E3C282]">check</span>}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleRequest}
          className="w-full bg-[#E3C282] text-[#001712] font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#FFDEA0] transition-colors uppercase"
        >
          {t.sendRequest || 'SEND REQUEST'}
        </button>
      </div>
    </div>
  );
};
