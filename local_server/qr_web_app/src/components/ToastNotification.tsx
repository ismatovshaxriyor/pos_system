import React from 'react';
import { useApp } from '../context/AppContext';

export const ToastNotification: React.FC = () => {
  const { toastMessage } = useApp();

  if (!toastMessage) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] bg-[#002019]/95 backdrop-blur-xl border border-[#E3C282]/60 rounded-full px-6 py-3 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-none max-w-[90vw]">
      <div className="flex items-center gap-2.5">
        <span className="material-symbols-outlined text-[#E3C282] text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
          auto_awesome
        </span>
        <p className="font-sans-body text-xs font-semibold uppercase tracking-widest text-[#E3C282] whitespace-nowrap overflow-hidden text-ellipsis">
          {toastMessage}
        </p>
      </div>
    </div>
  );
};
