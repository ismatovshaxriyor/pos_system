import React from 'react';
import { useApp } from '../context/AppContext';

export const ToastNotification: React.FC = () => {
  const { toastMessage } = useApp();

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[60] glass-card border border-[#E3C282]/50 rounded-full px-8 py-3.5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[#E3C282] text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          auto_awesome
        </span>
        <p className="font-sans-body text-xs font-semibold uppercase tracking-widest text-[#E3C282] whitespace-nowrap">
          {toastMessage}
        </p>
      </div>
    </div>
  );
};
