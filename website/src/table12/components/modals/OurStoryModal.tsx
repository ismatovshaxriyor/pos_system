import React from 'react';
import { useApp } from '../../context/AppContext';

export const OurStoryModal: React.FC = () => {
  const { isOurStoryModalOpen, setIsOurStoryModalOpen } = useApp();

  if (!isOurStoryModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-[#001712]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-2xl w-full rounded-2xl p-6 sm:p-10 border border-[#E3C282]/40 shadow-2xl overflow-y-auto max-h-[90vh]">
        <button
          onClick={() => setIsOurStoryModalOpen(false)}
          className="absolute top-5 right-5 text-[#C1C8C4] hover:text-[#E3C282] p-2 rounded-full hover:bg-[#0F2D26] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <span className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] uppercase block mb-2">
          HERITAGE & CRAFT
        </span>
        <h2 className="font-serif-display font-bold text-3xl sm:text-4xl text-[#C7EADE] mb-6">
          The Story of Table 12
        </h2>

        <div className="space-y-4 font-sans-body text-sm text-[#C1C8C4] leading-relaxed">
          <p>
            At Table 12, we celebrate the centuries-old gastronomy of the Silk Road, where Samarkand, Bukhara, and the Fergana Valley served as the culinary epicenters of Central Asia.
          </p>
          <p>
            Every dish is cooked in custom-hammered copper kazans over scented apricot and grape wood fires. We source rare Devzira rice directly from artisanal farmers in Uzgen and hand-harvested red saffron from high-altitude plateaus.
          </p>
          <div className="my-6 rounded-xl overflow-hidden border border-[#E3C282]/30 h-48">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOZaqYN0H7PxBGPBKxPCcJMgPy7pS8dOSxbvRtKrXRpGlLh1eyVfOvhFFFQjzd1c9Rc1pLylXIbkKZKaFxz2QfAevejo2hhyOvETmyHPiPzMWpRyOmF0GLJh_Dp5Nk_Wdl6K43h95RLbu_6X7jgEC1hD-m7ivHnLqReRqeyIzsxKZ196AZ-OA5QN_FUnIAYbbELMcpjlYrrVK4AskAUSK97SG5J61ZrCz6qD5T9peUAG9v4etYFB4JIlPTEN21CJEl7tTN-5HHx4U5"
              alt="Silk Road Heritage"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="italic text-[#E3C282]">
            "Hospitality — Mehmondostlik — is not merely a service to us; it is a sacred cultural duty passed down through generations."
          </p>
        </div>

        <div className="mt-8 text-center border-t border-[#E3C282]/20 pt-6">
          <button
            onClick={() => setIsOurStoryModalOpen(false)}
            className="bg-[#E3C282] text-[#001712] font-sans-body text-xs font-bold tracking-widest px-8 py-3 rounded-full hover:bg-[#FFDEA0] transition-colors uppercase"
          >
            CLOSE STORY
          </button>
        </div>
      </div>
    </div>
  );
};
