import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MENU_DISHES } from '../data/mockData';

export const DishDetailScreen: React.FC = () => {
  const {
    selectedDish,
    portionSize,
    setPortionSize,
    addToCart,
    openDishDetail,
    dishes,
    t
  } = useApp();

  const [quantity, setQuantity] = useState(1);

  const basePrice = portionSize === 'Large' 
    ? Math.round(selectedDish.priceUZS * 1.35) 
    : selectedDish.priceUZS;

  const totalPrice = basePrice * quantity;

  const similarDishes = dishes.filter((d) => d.id !== selectedDish.id).slice(0, 2);

  return (
    <div className="relative pb-36 animate-in fade-in duration-300">
      {/* Hero Section: Fullscreen/Large Dish Image */}
      <section className="h-[480px] sm:h-[580px] relative overflow-hidden">
        <img
          src={selectedDish.image}
          alt={selectedDish.name}
          className="w-full h-full object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#001712] via-[#001712]/30 to-transparent" />
        <div className="absolute bottom-8 left-0 w-full px-6 md:px-16">
          <div className="max-w-4xl">
            {selectedDish.isSignature && (
              <span className="font-sans-body text-[11px] font-bold tracking-widest text-[#E3C282] mb-2 block uppercase">
                {t.signatureDishLabel}
              </span>
            )}
            <h1 className="font-serif-display font-bold text-3xl sm:text-5xl text-[#C7EADE] mb-3">
              {selectedDish.name}
            </h1>
            <p className="font-sans-body text-sm sm:text-base text-[#C1C8C4] max-w-xl leading-relaxed">
              {selectedDish.description}
            </p>
          </div>
        </div>
      </section>

      {/* Details Content Grid */}
      <div className="px-6 md:px-16 -mt-4 relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 max-w-[1440px] mx-auto">
        {/* Left Column */}
        <div className="md:col-span-7 space-y-10">
          {/* Ingredients Bento */}
          <section>
            <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] mb-4 uppercase">
              {t.ingredients}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {selectedDish.ingredients.map((ing, i) => (
                <div key={i} className="glass-card p-3.5 rounded-xl flex items-center gap-3 border border-[#E3C282]/20">
                  <span className="material-symbols-outlined text-[#E3C282] text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {ing.icon}
                  </span>
                  <span className="font-sans-body text-[11px] font-bold tracking-wider text-[#C7EADE]">
                    {ing.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Chef's Recommendation Card */}
          {selectedDish.chefQuote && (
            <section className="glass-card p-6 sm:p-8 rounded-2xl relative overflow-hidden border border-[#E3C282]/30">
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#E3C282]/10 rotate-45 translate-x-8 -translate-y-8 border-l border-b border-[#E3C282]/30" />
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex-shrink-0 border-2 border-[#E3C282]/40 shadow-xl">
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuA9SLcsVKHqjTDVrWgsUzRk_uKPITtKM6lRWRXW2QC80WqqBzNVcp8iVUgLIn6d8tJlP-z5zwb4Pt3R8y-pr1Lvffn-mB8yvUTHquW_MKHY8lkPN_AMuj8x4_JkOSCYuSJYeKz9J226O_GjJk1OQplwWO2TDQL2TDRoN49H-bgJQZqV5Qd2nKiRjX9mKfDji0omLmECDN49ci8OA0X5TGj2DpIzYGbwBi7WebI7OubTwIdlrLvDREyX8s2EZIogwvs-qfdMGuvvlv4U"
                    alt="Chef Portrait"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-serif-display font-semibold text-xl text-[#C7EADE] mb-2">
                    {t.chefRecommendation}
                  </h3>
                  <p className="font-sans-body text-xs sm:text-sm text-[#C1C8C4] italic leading-relaxed">
                    "{selectedDish.chefQuote}"
                  </p>
                  {selectedDish.sommelierPairing && (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#E3C282] text-sm">wine_bar</span>
                      <span className="font-sans-body text-[10px] font-bold tracking-widest text-[#E3C282] uppercase">
                        {selectedDish.sommelierPairing}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Nutrition & Allergens */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-3">
              <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] uppercase mb-3">
                {t.nutritionFacts}
              </h3>
              <div className="space-y-2.5">
                <div className="flex justify-between items-end">
                  <span className="font-sans-body text-xs text-[#C1C8C4]">{t.caloriesLabel}</span>
                  <div className="dotted-leader" />
                  <span className="font-sans-body text-xs font-semibold text-[#C7EADE]">{selectedDish.calories} kcal</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="font-sans-body text-xs text-[#C1C8C4]">{t.proteinLabel}</span>
                  <div className="dotted-leader" />
                  <span className="font-sans-body text-xs font-semibold text-[#C7EADE]">{selectedDish.proteinGrams}g</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="font-sans-body text-xs text-[#C1C8C4]">{t.carbsLabel}</span>
                  <div className="dotted-leader" />
                  <span className="font-sans-body text-xs font-semibold text-[#C7EADE]">{selectedDish.carbsGrams}g</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] uppercase mb-3">
                {t.allergens}
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedDish.allergens.map((alg, idx) => (
                  <span
                    key={idx}
                    className="px-3.5 py-1.5 rounded-full border border-[#E3C282]/30 font-sans-body text-[10px] font-bold tracking-widest text-[#E3C282] uppercase bg-[#E3C282]/5"
                  >
                    {alg}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column */}
        <aside className="md:col-span-5 space-y-8">
          {/* Portion Size */}
          <div className="glass-card p-6 rounded-2xl border border-[#E3C282]/20">
            <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] mb-4 uppercase">
              {t.portionSize}
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => setPortionSize('Standard')}
                className={`flex-1 py-3 rounded-xl border font-sans-body text-xs font-bold tracking-wider transition-all ${
                  portionSize === 'Standard'
                    ? 'border-[#E3C282] bg-[#E3C282] text-[#001712]'
                    : 'border-[#E3C282]/30 text-[#C7EADE] hover:border-[#E3C282]/60'
                }`}
              >
                STANDARD ({selectedDish.portion})
              </button>
              <button
                onClick={() => setPortionSize('Large')}
                className={`flex-1 py-3 rounded-xl border font-sans-body text-xs font-bold tracking-wider transition-all ${
                  portionSize === 'Large'
                    ? 'border-[#E3C282] bg-[#E3C282] text-[#001712]'
                    : 'border-[#E3C282]/30 text-[#C7EADE] hover:border-[#E3C282]/60'
                }`}
              >
                LARGE (650G)
              </button>
            </div>
          </div>

          {/* Similar Dishes */}
          <div>
            <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] mb-4 uppercase">
              {t.similarDishes}
            </h3>
            <div className="space-y-4">
              {similarDishes.map((sd) => (
                <div
                  key={sd.id}
                  onClick={() => openDishDetail(sd)}
                  className="group flex gap-4 cursor-pointer glass-card p-3 rounded-xl border border-[#E3C282]/20 hover:border-[#E3C282]/50 transition-all"
                >
                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={sd.image}
                      alt={sd.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="flex-1 py-0.5 flex flex-col justify-between">
                    <div>
                      <h4 className="font-serif-display font-semibold text-base text-[#C7EADE] group-hover:text-[#E3C282] transition-colors">
                        {sd.name}
                      </h4>
                      <p className="font-sans-body text-xs text-[#C1C8C4] line-clamp-1 mt-0.5">
                        {sd.description}
                      </p>
                    </div>
                    <span className="font-sans-body text-xs font-bold text-[#E3C282]">
                      {sd.priceUZS.toLocaleString()} UZS
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom Sticky Action Footer Bar */}
      <div className="fixed bottom-0 left-0 w-full z-50 p-4 sm:p-6 md:px-16 pointer-events-none">
        <div className="max-w-5xl mx-auto glass-card rounded-full p-3 sm:p-4 flex items-center justify-between shadow-2xl pointer-events-auto border border-[#E3C282]/40 bg-[#001712]/90 backdrop-blur-2xl">
          <div className="flex items-center gap-3 ml-2">
            <span className="font-sans-body text-xs font-bold tracking-widest text-[#C1C8C4] uppercase">
              {t.price || "Narxi"}:
            </span>
            <span className="font-serif-display font-bold text-xl sm:text-2xl text-[#E3C282]">
              {selectedDish.priceUZS.toLocaleString()} UZS
            </span>
          </div>

          <button
            onClick={() => setCurrentScreen('menu')}
            className="bg-[#E3C282] text-[#001712] px-6 sm:px-8 py-3 rounded-full font-sans-body text-xs font-bold tracking-widest flex items-center gap-2 hover:bg-[#FFDEA0] transition-all active:scale-95 uppercase shadow-lg shadow-[#E3C282]/20"
          >
            <span className="material-symbols-outlined text-lg">restaurant_menu</span>
            <span>{t.exploreMenu || "Menyuga qaytish"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
