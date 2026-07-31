import React, { ReactNode } from 'react';
import { useApp } from '../context/AppContext';

// Mock ma'lumot butunlay yo'q - ilova FAQAT haqiqiy restoran menyusi/stol
// ma'lumoti bilan ishlaydi. Shu sababli ostidagi ekranlar (`children`)
// hech qachon "hali javob kelmagan" yoki "ulanmagan" holatda render
// bo'lmasligi kerak - aks holda bo'sh/yarim to'ldirilgan holat ko'rinib
// qolardi. Yuklanish/xato shu yerda to'liq ekran sifatida ko'rsatiladi.
export const LiveDataGate: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { menuLoading, connectionError, retryConnection, t } = useApp();

  if (menuLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0A1F44] oriental-pattern-overlay gap-6">
        <span className="material-symbols-outlined text-[#0077CC] text-5xl animate-spin">
          progress_activity
        </span>
        <p className="font-sans-body text-xs font-semibold tracking-widest text-[#9FB0C4] uppercase">
          {t.loadingMenu}
        </p>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0A1F44] oriental-pattern-overlay gap-6 px-8 text-center">
        <span className="material-symbols-outlined text-[#0077CC] text-6xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          wifi_off
        </span>
        <div className="space-y-2">
          <h1 className="font-serif-display font-semibold text-2xl text-[#FFFFFF]">
            {t.connectionErrorTitle}
          </h1>
          <p className="font-sans-body text-sm text-[#9FB0C4] max-w-sm">
            {t.connectionErrorMessage}
          </p>
        </div>
        <button
          onClick={retryConnection}
          className="bg-[#0077CC] text-white px-8 py-3.5 rounded-full font-sans-body text-xs font-bold tracking-widest hover:bg-[#4DA6E0] transition-all uppercase"
        >
          {t.retryButton}
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
