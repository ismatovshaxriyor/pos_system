import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const PaymentModal: React.FC = () => {
  const { isPayModalOpen, setIsPayModalOpen, totalUZS, showToast, clearCart } = useApp();
  const [method, setMethod] = useState<'card' | 'apple'>('card');
  const [cardNumber, setCardNumber] = useState('8600 4910 **** 8219');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('812');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isPayModalOpen) return null;

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSuccess(true);
    showToast('Payment successful! Thank you for dining with us.');
  };

  const handleFinish = () => {
    setIsSuccess(false);
    clearCart();
    setIsPayModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0A1F44]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-md w-full rounded-2xl p-6 sm:p-8 border border-[#0077CC]/40 shadow-2xl">
        <button
          onClick={() => {
            setIsSuccess(false);
            setIsPayModalOpen(false);
          }}
          className="absolute top-5 right-5 text-[#9FB0C4] hover:text-[#0077CC] p-2 rounded-full hover:bg-[#0F2A5C] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        {isSuccess ? (
          <div className="text-center py-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-[#5C9FD6]/20 border-2 border-[#5C9FD6] rounded-full flex items-center justify-center mx-auto mb-4 text-[#5C9FD6]">
              <span className="material-symbols-outlined text-3xl">check</span>
            </div>
            <span className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
              PAYMENT CONFIRMED
            </span>
            <h2 className="font-serif-display font-bold text-2xl text-[#FFFFFF] mb-2">
              Receipt Sent
            </h2>
            <p className="font-sans-body text-xs text-[#9FB0C4] mb-6">
              Total paid: <span className="text-[#0077CC] font-bold">{totalUZS.toLocaleString()} UZS</span>. We look forward to serving you again at Table 12.
            </p>
            <button
              onClick={handleFinish}
              className="w-full bg-[#0077CC] text-white font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#4DA6E0] transition-colors uppercase"
            >
              DONE
            </button>
          </div>
        ) : (
          <div>
            <span className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
              SECURE CHECKOUT
            </span>
            <h2 className="font-serif-display font-bold text-2xl text-[#FFFFFF] mb-2">
              Pay Bill
            </h2>
            <p className="font-sans-body text-xs text-[#9FB0C4] mb-6">
              Total due: <span className="text-[#0077CC] font-bold">{totalUZS.toLocaleString()} UZS</span>
            </p>

            {/* Method selector */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`py-3 px-4 rounded-xl border text-xs font-bold font-sans-body flex items-center justify-center gap-2 transition-all ${
                  method === 'card'
                    ? 'border-[#0077CC] bg-[#0077CC]/20 text-[#0077CC]'
                    : 'border-[#0077CC]/20 text-[#9FB0C4]'
                }`}
              >
                <span className="material-symbols-outlined text-base">credit_card</span>
                <span>UZCARD / VISA</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('apple')}
                className={`py-3 px-4 rounded-xl border text-xs font-bold font-sans-body flex items-center justify-center gap-2 transition-all ${
                  method === 'apple'
                    ? 'border-[#0077CC] bg-[#0077CC]/20 text-[#0077CC]'
                    : 'border-[#0077CC]/20 text-[#9FB0C4]'
                }`}
              >
                <span className="material-symbols-outlined text-base">phone_iphone</span>
                <span>APPLE PAY</span>
              </button>
            </div>

            <form onSubmit={handlePay} className="space-y-4">
              {method === 'card' ? (
                <>
                  <div>
                    <label className="font-sans-body text-[10px] font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
                      CARD NUMBER
                    </label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      required
                      className="w-full bg-[#050D1D] border border-[#0077CC]/20 rounded-xl p-3 text-xs text-[#FFFFFF] font-mono focus:outline-none focus:border-[#0077CC]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-sans-body text-[10px] font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
                        EXPIRY
                      </label>
                      <input
                        type="text"
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        required
                        className="w-full bg-[#050D1D] border border-[#0077CC]/20 rounded-xl p-3 text-xs text-[#FFFFFF] font-mono focus:outline-none focus:border-[#0077CC]"
                      />
                    </div>
                    <div>
                      <label className="font-sans-body text-[10px] font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
                        CVV
                      </label>
                      <input
                        type="password"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value)}
                        required
                        className="w-full bg-[#050D1D] border border-[#0077CC]/20 rounded-xl p-3 text-xs text-[#FFFFFF] font-mono focus:outline-none focus:border-[#0077CC]"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 bg-[#050D1D] rounded-xl border border-[#0077CC]/20 text-center">
                  <p className="font-sans-body text-xs text-[#FFFFFF] mb-2">
                    Double-click side button to complete Apple Pay transaction.
                  </p>
                  <span className="font-serif-display font-bold text-lg text-[#0077CC]">
                    {totalUZS.toLocaleString()} UZS
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="w-full mt-4 bg-[#0077CC] text-white font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#4DA6E0] transition-colors uppercase shadow-lg"
              >
                PAY {totalUZS.toLocaleString()} UZS
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
