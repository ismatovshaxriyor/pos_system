import React from 'react';
import { useApp } from '../context/AppContext';
import { ScreenView } from '../types';

export const BottomNav: React.FC = () => {
  const { currentScreen, setCurrentScreen, cart, waiterStatus, t } = useApp();

  const totalCartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const navItems: { id: ScreenView; label: string; icon: string }[] = [
    { id: 'menu', label: t.menu, icon: 'menu_book' },
    { id: 'bill', label: t.bill, icon: 'receipt_long' },
    { id: 'waiter', label: t.waiter, icon: 'person_raised_hand' },
  ];

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-around px-2 sm:px-3 py-2 w-[94%] max-w-md bg-[#001712]/80 dark:bg-[#002019]/80 backdrop-blur-2xl border border-[#E3C282]/35 shadow-2xl rounded-full transition-all">
      {navItems.map((item) => {
        const isActive = currentScreen === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setCurrentScreen(item.id)}
            className={`relative flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full transition-all duration-300 active:scale-95 whitespace-nowrap ${
              isActive
                ? 'bg-[#ADCDC3] text-[#18362E] font-bold shadow-lg shadow-[#ADCDC3]/20 scale-100'
                : 'text-[#C1C8C4] hover:text-[#E3C282] hover:bg-[#1A3A32]/40'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-all shrink-0 ${isActive ? 'filled' : ''}`}
            >
              {item.icon}
            </span>
            <span className="font-sans-body text-[11px] sm:text-xs font-semibold tracking-wider uppercase">
              {item.label}
            </span>



            {/* Pulsing indicator for Waiter if status is 'coming' */}
            {item.id === 'waiter' && waiterStatus === 'coming' && !isActive && (
              <span className="absolute top-1.5 right-2 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E3C282] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E3C282]"></span>
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
