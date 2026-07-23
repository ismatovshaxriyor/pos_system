import React, { useState } from 'react';
import { Search, ShieldCheck, AlertCircle, CheckCircle2, Key, Calendar, Cpu, HardDrive } from 'lucide-react';
import { checkLicense } from '../services/api';

export default function LicenseChecker() {
  const [licenseKey, setLicenseKey] = useState('');
  const [result, setResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;

    setIsSearching(true);
    setResult(null);

    const apiRes = await checkLicense(licenseKey);
    setIsSearching(false);
    setResult({
      status: apiRes.status,
      restaurant: apiRes.restaurant || 'Restoran Nomi',
      expiresAt: apiRes.expires_at ? new Date(apiRes.expires_at).toLocaleString() : 'Noma\'lum',
      hardwareHash: apiRes.hardware_bound ? 'Bog\'langan' : 'Bog\'lanmagan',
      message: apiRes.detail || ''
    });
  };

  return (
    <section id="litsenziya" className="py-24 relative overflow-hidden bg-[#001712] oriental-pattern-overlay">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Card Container */}
        <div className="glass-card p-8 sm:p-12 rounded-3xl gold-border-glow border-[#e3c282]/40 space-y-8">
          
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#e3c282]/20 flex items-center justify-center mx-auto border border-[#e3c282]">
              <Key className="w-6 h-6 text-[#e3c282]" />
            </div>
            <h2 className="font-serif-display text-2xl sm:text-4xl font-bold text-gradient-gold">
              Litsenziya Holatini Tekshirish
            </h2>
            <p className="text-xs sm:text-sm text-[#adcdc3]">
              Litsenziya kalitingizni (masalan: <code className="text-[#e3c282] font-mono font-bold">DEMO-7777-OKAY</code>) kiriting va uning RS256 amal qilish muddatini tekshiring.
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleCheck} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX formatidagi kalit..."
                className="w-full bg-[#001712]/80 border border-[#e3c282]/40 rounded-xl px-4 py-3.5 text-sm text-white font-mono placeholder-[#adcdc3]/50 focus:outline-none focus:border-[#e3c282]"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="btn-gold px-8 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>{isSearching ? 'Tekshirilmoqda...' : 'Tekshirish'}</span>
            </button>
          </form>

          {/* Quick Demo Shortcuts */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono text-[#adcdc3]">
            <span>Namuna kalitlar:</span>
            <button
              type="button"
              onClick={() => setLicenseKey('DEMO-7777-OKAY')}
              className="px-2.5 py-1 rounded bg-[#e3c282]/10 border border-[#e3c282]/30 text-[#e3c282] hover:bg-[#e3c282]/20"
            >
              DEMO-7777-OKAY
            </button>
            <button
              type="button"
              onClick={() => setLicenseKey('EXPIRED-2026-TEST')}
              className="px-2.5 py-1 rounded bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-950/60"
            >
              EXPIRED-2026-TEST
            </button>
          </div>

          {/* Result Display */}
          {result && (
            <div className={`p-6 rounded-2xl border font-mono space-y-4 animate-fadeIn ${
              result.status === 'active'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/50 border-red-500/40 text-red-200'
            }`}>
              <div className="flex items-center gap-3 border-b border-current/20 pb-3">
                {result.status === 'active' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
                )}
                <div>
                  <h4 className="font-bold text-sm text-white">{result.restaurant}</h4>
                  <span className="text-xs opacity-90">{result.message}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#e3c282]" />
                  <span>Amal qilish: <strong className="text-white">{result.expiresAt}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#e3c282]" />
                  <span>Hardware Hash: <strong className="text-white">{result.hardwareHash}</strong></span>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
}
