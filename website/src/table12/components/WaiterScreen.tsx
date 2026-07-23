import React from 'react';
import { useApp } from '../context/AppContext';

export const WaiterScreen: React.FC = () => {
  const {
    t,
    waiterStatus,
    callWaiter,
    cancelWaiterCall,
    waiterHistory,
    setIsCutleryModalOpen,
    setIsFeedbackModalOpen,
    setCurrentScreen,
  } = useApp();

  return (
    <div className="pt-24 pb-36 px-6 max-w-xl mx-auto min-h-screen animate-in fade-in duration-300">
      {/* Title Header */}
      <section className="mb-10 text-center">
        <h2 className="font-serif-display font-semibold text-2xl sm:text-3xl text-[#E3C282] mb-2">
          {t.howAssist}
        </h2>
        <p className="font-sans-body text-sm text-[#C1C8C4] opacity-80 max-w-md mx-auto">
          {t.howAssistSub}
        </p>
      </section>

      {/* Active Request Widget */}
      {waiterStatus === 'coming' ? (
        <div className="mb-8 glass-card rounded-2xl p-5 flex items-center justify-between gold-border-glow border border-[#E3C282]/40 bg-[#0F2D26]/40">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <span className="material-symbols-outlined text-[#E3C282] text-3xl">
                person_raised_hand
              </span>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E3C282] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#E3C282]"></span>
              </span>
            </div>
            <div>
              <p className="font-sans-body text-[10px] font-bold tracking-widest text-[#E3C282] uppercase">
                {t.currentRequest}
              </p>
              <p className="font-serif-display font-semibold text-lg sm:text-xl text-[#C7EADE]">
                {t.waiterComing}
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div>
              <p className="font-sans-body text-[10px] font-bold tracking-widest text-[#C1C8C4] uppercase">
                {t.estTime}
              </p>
              <p className="font-sans-body font-bold text-sm text-[#ADCDC3]">
                ~2 min
              </p>
            </div>
            <button
              onClick={cancelWaiterCall}
              className="text-[10px] text-red-400/80 hover:text-red-300 underline font-sans-body tracking-wider uppercase mt-1"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-8 glass-card rounded-2xl p-4 text-center border border-[#E3C282]/20">
          <p className="font-sans-body text-xs text-[#C1C8C4]">
            No active request. Select an option below to notify your server.
          </p>
        </div>
      )}

      {/* Action Cards Grid */}
      <div className="grid grid-cols-1 gap-4 mb-10">
        {/* Call Waiter */}
        <button
          onClick={() => callWaiter('Call waiter')}
          className="glass-card rounded-2xl p-5 flex items-center gap-5 group text-left w-full active:scale-[0.98] transition-all hover:border-[#E3C282]/50 hover:bg-[#0F2D26]/40"
        >
          <div className="w-14 h-14 rounded-full bg-[#E3C282]/10 flex items-center justify-center border border-[#E3C282]/30 group-hover:bg-[#E3C282]/20 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[#E3C282] text-2xl">
              notifications_active
            </span>
          </div>
          <div className="flex-1">
            <h3 className="font-serif-display font-semibold text-lg text-[#E3C282] mb-0.5">
              {t.callWaiter}
            </h3>
            <p className="font-sans-body text-xs text-[#C1C8C4]">
              {t.callWaiterDesc}
            </p>
          </div>
          <span className="material-symbols-outlined text-[#E3C282]/50 group-hover:translate-x-1 transition-transform">
            chevron_right
          </span>
        </button>

        {/* Ask for Bill */}
        <button
          onClick={() => {
            callWaiter('Ask for bill');
            setCurrentScreen('bill');
          }}
          className="glass-card rounded-2xl p-5 flex items-center gap-5 group text-left w-full active:scale-[0.98] transition-all hover:border-[#E3C282]/50 hover:bg-[#0F2D26]/40"
        >
          <div className="w-14 h-14 rounded-full bg-[#E3C282]/10 flex items-center justify-center border border-[#E3C282]/30 group-hover:bg-[#E3C282]/20 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[#E3C282] text-2xl">
              receipt_long
            </span>
          </div>
          <div className="flex-1">
            <h3 className="font-serif-display font-semibold text-lg text-[#E3C282] mb-0.5">
              {t.askBill}
            </h3>
            <p className="font-sans-body text-xs text-[#C1C8C4]">
              {t.askBillDesc}
            </p>
          </div>
          <span className="material-symbols-outlined text-[#E3C282]/50 group-hover:translate-x-1 transition-transform">
            chevron_right
          </span>
        </button>

        {/* Request Extra Cutlery */}
        <button
          onClick={() => setIsCutleryModalOpen(true)}
          className="glass-card rounded-2xl p-5 flex items-center gap-5 group text-left w-full active:scale-[0.98] transition-all hover:border-[#E3C282]/50 hover:bg-[#0F2D26]/40"
        >
          <div className="w-14 h-14 rounded-full bg-[#E3C282]/10 flex items-center justify-center border border-[#E3C282]/30 group-hover:bg-[#E3C282]/20 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[#E3C282] text-2xl">
              flatware
            </span>
          </div>
          <div className="flex-1">
            <h3 className="font-serif-display font-semibold text-lg text-[#E3C282] mb-0.5">
              {t.requestCutlery}
            </h3>
            <p className="font-sans-body text-xs text-[#C1C8C4]">
              {t.requestCutleryDesc}
            </p>
          </div>
          <span className="material-symbols-outlined text-[#E3C282]/50 group-hover:translate-x-1 transition-transform">
            chevron_right
          </span>
        </button>

        {/* Leave Feedback */}
        <button
          onClick={() => setIsFeedbackModalOpen(true)}
          className="glass-card rounded-2xl p-5 flex items-center gap-5 group text-left w-full active:scale-[0.98] transition-all hover:border-[#E3C282]/50 hover:bg-[#0F2D26]/40"
        >
          <div className="w-14 h-14 rounded-full bg-[#E3C282]/10 flex items-center justify-center border border-[#E3C282]/30 group-hover:bg-[#E3C282]/20 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[#E3C282] text-2xl">
              star
            </span>
          </div>
          <div className="flex-1">
            <h3 className="font-serif-display font-semibold text-lg text-[#E3C282] mb-0.5">
              {t.leaveFeedback}
            </h3>
            <p className="font-sans-body text-xs text-[#C1C8C4]">
              {t.leaveFeedbackDesc}
            </p>
          </div>
          <span className="material-symbols-outlined text-[#E3C282]/50 group-hover:translate-x-1 transition-transform">
            chevron_right
          </span>
        </button>
      </div>

      {/* Sommelier's Note Card */}
      <div className="relative glass-card p-6 rounded-2xl overflow-hidden mb-10 border border-[#E3C282]/30">
        <div className="absolute top-0 right-0 w-14 h-14 bg-[#E3C282]/20 rounded-bl-3xl border-b border-l border-[#E3C282]/40 flex items-center justify-center">
          <span className="material-symbols-outlined text-[#E3C282] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
            wine_bar
          </span>
        </div>
        <p className="font-sans-body text-[10px] font-bold tracking-widest text-[#E3C282] mb-3 uppercase">
          {t.sommelierNote}
        </p>
        <h4 className="font-serif-display font-semibold text-xl text-[#C7EADE] mb-2">
          {t.exclusivePairing}
        </h4>
        <p className="font-sans-body text-xs text-[#C1C8C4] leading-relaxed italic mb-5">
          {t.exclusivePairingText}
        </p>
        <button
          onClick={() => callWaiter('Sommelier Wine Pairing requested')}
          className="font-sans-body text-[11px] font-bold tracking-widest border border-[#E3C282] text-[#E3C282] px-5 py-2 rounded-full hover:bg-[#E3C282] hover:text-[#001712] transition-all uppercase active:scale-95"
        >
          {t.requestPairing}
        </button>
      </div>

      {/* Request History Timeline */}
      <section>
        <h5 className="font-sans-body text-[11px] font-bold tracking-widest text-[#918F86] mb-5 border-b border-[#E3C282]/20 pb-2 uppercase">
          {t.requestHistory}
        </h5>
        <div className="space-y-4">
          {waiterHistory.map((item) => (
            <div key={item.id} className="flex items-center justify-between opacity-80 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined ${item.status === 'COMPLETED' ? 'text-[#ADCDC3]' : 'text-[#E3C282]'}`}>
                  {item.status === 'COMPLETED' ? 'check_circle' : 'hourglass_top'}
                </span>
                <div>
                  <p className="font-sans-body text-sm text-[#C7EADE] font-medium">{item.title}</p>
                  <p className="font-sans-body text-[10px] uppercase tracking-widest text-[#C1C8C4]">{item.time}</p>
                </div>
              </div>
              <span className={`font-sans-body text-[10px] font-bold tracking-widest ${item.status === 'COMPLETED' ? 'text-[#ADCDC3]' : 'text-[#E3C282]'}`}>
                {item.status === 'COMPLETED' ? t.completed : 'IN PROGRESS'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
