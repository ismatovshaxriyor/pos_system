import React from 'react';
import { useApp } from '../context/AppContext';

export const BillScreen: React.FC = () => {
  const {
    cart,
    subtotalUZS,
    serviceFeeUZS,
    totalUZS,
    t,
    callWaiter,
    setIsSplitBillModalOpen,
    setIsPayModalOpen,
    updateCartQuantity,
    removeFromCart,
  } = useApp();

  return (
    <div className="pt-24 pb-48 px-6 max-w-lg mx-auto relative min-h-screen animate-in fade-in duration-300">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 -z-10 opacity-20 pointer-events-none oriental-pattern-overlay" />

      {/* Section Header */}
      <div className="mb-8 text-center">
        <h1 className="font-serif-display font-bold text-3xl sm:text-4xl text-[#C7EADE] mb-1">
          {t.yourTable}
        </h1>
        <p className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] uppercase opacity-90">
          {t.orderInProgress}
        </p>
      </div>

      {/* Receipt Card */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 relative overflow-hidden border border-[#E3C282]/35 shadow-2xl">
        {/* Corner Accent */}
        <div className="absolute top-0 right-0 w-16 h-16 bg-[#E3C282]/10 -rotate-45 translate-x-8 -translate-y-8 border-b border-[#E3C282]/30 pointer-events-none" />

        <div className="text-center mb-6 border-b border-[#E3C282]/20 pb-5">
          <p className="font-serif-display font-bold text-2xl text-[#E3C282]">
            Table 12
          </p>
          <p className="font-sans-body text-[10px] font-bold tracking-widest text-[#C1C8C4] mt-1">
            OCT 14, 2026 • 20:45
          </p>
        </div>

        {/* Itemized Order List */}
        <div className="space-y-5 mb-6">
          {cart.length === 0 ? (
            <p className="text-center font-sans-body text-xs text-[#C1C8C4] py-4">
              Your order table is currently empty.
            </p>
          ) : (
            cart.map((item, index) => {
              const itemTotal = item.priceUZS * item.quantity;
              return (
                <div key={index} className="group relative flex flex-col gap-1">
                  <div className="flex justify-between items-baseline">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-sans-body text-sm font-semibold text-[#C7EADE]">
                          {item.quantity}x {item.dish.name}
                        </span>
                        {item.portionSize === 'Large' && (
                          <span className="text-[9px] bg-[#E3C282]/20 text-[#E3C282] px-1.5 py-0.5 rounded font-sans-body uppercase">
                            Large
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#C1C8C4] font-sans-body uppercase tracking-wider">
                        {item.dish.category}
                      </span>
                    </div>

                    <span className="dotted-leader" />

                    <div className="flex items-center gap-2">
                      <span className="font-sans-body text-xs font-semibold text-[#C7EADE]">
                        {itemTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-2 mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => updateCartQuantity(item.dish.id, -1)}
                      className="w-5 h-5 rounded bg-[#00110D] text-[#E3C282] flex items-center justify-center text-xs hover:bg-[#E3C282]/20"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="font-sans-body text-xs text-[#C7EADE]">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item.dish.id, 1)}
                      className="w-5 h-5 rounded bg-[#00110D] text-[#E3C282] flex items-center justify-center text-xs hover:bg-[#E3C282]/20"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.dish.id)}
                      className="text-[10px] text-red-400 ml-2 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals Section */}
        <div className="border-t border-[#E3C282]/20 pt-5 space-y-2.5">
          <div className="flex justify-between font-sans-body text-xs text-[#C1C8C4]">
            <span>{t.subtotal}</span>
            <span>{subtotalUZS.toLocaleString()} UZS</span>
          </div>
          <div className="flex justify-between font-sans-body text-xs text-[#C1C8C4]">
            <span>{t.serviceFee}</span>
            <span>{serviceFeeUZS.toLocaleString()} UZS</span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-[#E3C282]/40">
            <span className="font-serif-display font-bold text-xl sm:text-2xl text-[#E3C282]">
              {t.total}
            </span>
            <span className="font-serif-display font-bold text-xl sm:text-2xl text-[#E3C282]">
              {totalUZS.toLocaleString()} <span className="text-xs font-sans-body">UZS</span>
            </span>
          </div>
        </div>

        {/* Bottom ZigZag Accent Line */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E3C282]/5 via-[#E3C282]/30 to-[#E3C282]/5" />
      </div>

      {/* Action Buttons Grid */}
      <div className="mt-6 grid grid-cols-2 gap-3.5">
        <button
          onClick={() => callWaiter('Call waiter')}
          className="glass-card rounded-full py-3.5 px-4 flex flex-col items-center justify-center gap-1.5 hover:bg-[#E3C282]/10 transition-all active:scale-95 border border-[#E3C282]/30"
        >
          <span className="material-symbols-outlined text-[#E3C282] text-xl">
            person_raised_hand
          </span>
          <span className="font-sans-body text-[10px] font-bold tracking-widest text-[#E3C282] uppercase">
            {t.callWaiter}
          </span>
        </button>

        <button
          onClick={() => callWaiter('Request final bill check')}
          className="glass-card rounded-full py-3.5 px-4 flex flex-col items-center justify-center gap-1.5 hover:bg-[#E3C282]/10 transition-all active:scale-95 border border-[#E3C282]/30"
        >
          <span className="material-symbols-outlined text-[#E3C282] text-xl">
            receipt_long
          </span>
          <span className="font-sans-body text-[10px] font-bold tracking-widest text-[#E3C282] uppercase">
            {t.askBill}
          </span>
        </button>

        <button
          onClick={() => setIsSplitBillModalOpen(true)}
          className="glass-card rounded-full py-3.5 px-4 flex flex-col items-center justify-center gap-1.5 hover:bg-[#E3C282]/10 transition-all active:scale-95 border border-[#E3C282]/30"
        >
          <span className="material-symbols-outlined text-[#E3C282] text-xl">
            call_split
          </span>
          <span className="font-sans-body text-[10px] font-bold tracking-widest text-[#E3C282] uppercase">
            {t.splitBill}
          </span>
        </button>

        <button
          onClick={() => setIsPayModalOpen(true)}
          className="bg-[#ADCDC3] text-[#18362E] rounded-full py-3.5 px-4 flex flex-col items-center justify-center gap-1.5 hover:bg-[#C9EADF] transition-all active:scale-95 shadow-lg shadow-[#ADCDC3]/20"
        >
          <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            credit_card
          </span>
          <span className="font-sans-body text-[10px] font-bold tracking-widest uppercase">
            {t.payCard}
          </span>
        </button>
      </div>

      {/* Bottom Sticky Total Tracker Bar */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-[#0e2f28]/90 backdrop-blur-md rounded-2xl p-4 border border-[#E3C282]/30 shadow-2xl flex justify-between items-center z-40">
        <div>
          <p className="font-sans-body text-[10px] font-bold tracking-widest text-[#C1C8C4] uppercase">
            Current Total
          </p>
          <p className="font-serif-display font-bold text-lg text-[#E3C282]">
            {totalUZS.toLocaleString()} UZS
          </p>
        </div>
        <button
          onClick={() => setIsPayModalOpen(true)}
          className="bg-[#ADCDC3] text-[#18362E] font-sans-body text-xs font-bold tracking-widest px-6 py-2.5 rounded-full active:scale-95 transition-transform uppercase shadow-md"
        >
          {t.payNow}
        </button>
      </div>
    </div>
  );
};
