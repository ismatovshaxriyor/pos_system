import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Language } from '../types';

export const Header: React.FC = () => {
  const { currentScreen, setCurrentScreen, language, setLanguage, t, waiterStatus, tableInfo } = useApp();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const languages: { code: Language; name: string }[] = [
    { code: 'EN', name: 'English' },
    { code: 'RU', name: 'Русский' },
    { code: 'UZ', name: "O'zbekcha" },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-[#0A1F44]/70 dark:bg-[#0F2A5C]/70 backdrop-blur-xl border-b border-[#0077CC]/30 flex justify-between items-center px-6 h-16 transition-all duration-300">
      <div className="flex items-center gap-3">
        {currentScreen === 'dish-detail' ? (
          <button
            onClick={() => setCurrentScreen('menu')}
            className="p-2 -ml-2 rounded-full hover:bg-[#0F2A5C] text-[#0077CC] transition-colors active:scale-95 flex items-center gap-1"
            aria-label="Back to Menu"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
        ) : null}

        <button 
          onClick={() => setCurrentScreen('home')}
          className="flex items-center gap-2 text-left group shrink-0"
        >
          <span className="material-symbols-outlined text-[#0077CC] text-2xl group-hover:scale-105 transition-transform shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            restaurant
          </span>
          <span className="font-serif-display font-bold text-xl sm:text-2xl text-[#0077CC] tracking-tight whitespace-nowrap">
            {tableInfo ? (language === 'UZ' ? `${tableInfo.tableName}-Stol` : `${t.tableNumber} ${tableInfo.tableName}`) : 'Hamroh POS'}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        {/* Waiter Available Status Badge (Hidden on small mobile if screen is detailed, or shown cleanly) */}
        {currentScreen === 'home' && (
          <div 
            onClick={() => setCurrentScreen('waiter')}
            className="hidden md:flex items-center gap-2 cursor-pointer bg-[#0F2A5C]/60 border border-[#0077CC]/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wider text-[#0077CC] hover:bg-[#0F2A5C] transition-all"
          >
            <span className={`w-2 h-2 rounded-full ${waiterStatus === 'coming' ? 'bg-[#0077CC] animate-ping' : 'bg-emerald-400'}`} />
            <span className="material-symbols-outlined text-sm">person_raised_hand</span>
            <span>{waiterStatus === 'coming' ? t.waiterComing : t.waiterAvailable}</span>
          </div>
        )}

        {/* Language Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
            className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] border border-[#0077CC]/30 px-3.5 py-1.5 rounded-full hover:bg-[#0077CC]/10 transition-colors flex items-center gap-1.5 active:scale-95"
          >
            <span>{language}</span>
            <span className="material-symbols-outlined text-sm">expand_more</span>
          </button>

          {isLangMenuOpen && (
            <div className="absolute right-0 mt-2 w-36 glass-card rounded-xl border border-[#0077CC]/40 shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsLangMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs font-semibold transition-colors flex items-center justify-between ${
                    language === lang.code ? 'text-[#0077CC] bg-[#0077CC]/15' : 'text-[#FFFFFF] hover:bg-[#0F2A5C]'
                  }`}
                >
                  <span>{lang.name}</span>
                  {language === lang.code && <span className="material-symbols-outlined text-sm text-[#0077CC]">check</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
