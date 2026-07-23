import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Language } from '../types';

export const Header: React.FC = () => {
  const { currentScreen, setCurrentScreen, language, setLanguage, t, waiterStatus } = useApp();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const languages: { code: Language; name: string }[] = [
    { code: 'EN', name: 'English' },
    { code: 'RU', name: 'Русский' },
    { code: 'UZ', name: "O'zbekcha" },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-[#001712]/70 dark:bg-[#002019]/70 backdrop-blur-xl border-b border-[#E3C282]/30 flex justify-between items-center px-6 h-16 transition-all duration-300">
      <div className="flex items-center gap-3">
        {currentScreen === 'dish-detail' ? (
          <button
            onClick={() => setCurrentScreen('menu')}
            className="p-2 -ml-2 rounded-full hover:bg-[#0F2D26] text-[#E3C282] transition-colors active:scale-95 flex items-center gap-1"
            aria-label="Back to Menu"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
        ) : null}

        <button 
          onClick={() => setCurrentScreen('home')}
          className="flex items-center gap-2 text-left group"
        >
          <span className="material-symbols-outlined text-[#E3C282] text-2xl group-hover:scale-105 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }}>
            restaurant
          </span>
          <span className="font-serif-display font-bold text-2xl text-[#E3C282] tracking-tight">
            {t.tableNumber}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        {/* Waiter Available Status Badge (Hidden on small mobile if screen is detailed, or shown cleanly) */}
        {currentScreen === 'home' && (
          <div 
            onClick={() => setCurrentScreen('waiter')}
            className="hidden md:flex items-center gap-2 cursor-pointer bg-[#0F2D26]/60 border border-[#E3C282]/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wider text-[#E3C282] hover:bg-[#0F2D26] transition-all"
          >
            <span className={`w-2 h-2 rounded-full ${waiterStatus === 'coming' ? 'bg-[#E3C282] animate-ping' : 'bg-emerald-400'}`} />
            <span className="material-symbols-outlined text-sm">person_raised_hand</span>
            <span>{waiterStatus === 'coming' ? t.waiterComing : t.waiterAvailable}</span>
          </div>
        )}

        {/* Language Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
            className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] border border-[#E3C282]/30 px-3.5 py-1.5 rounded-full hover:bg-[#E3C282]/10 transition-colors flex items-center gap-1.5 active:scale-95"
          >
            <span>{language}</span>
            <span className="material-symbols-outlined text-sm">expand_more</span>
          </button>

          {isLangMenuOpen && (
            <div className="absolute right-0 mt-2 w-36 glass-card rounded-xl border border-[#E3C282]/40 shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsLangMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors flex items-center justify-between ${
                    language === lang.code ? 'text-[#E3C282] bg-[#E3C282]/15' : 'text-[#C7EADE] hover:bg-[#0F2D26]'
                  }`}
                >
                  <span>{lang.name}</span>
                  {language === lang.code && <span className="material-symbols-outlined text-sm text-[#E3C282]">check</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
