import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

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

  // openDishDetail (MenuScreen/HomeScreen) doim haqiqiy taom bilan
  // chaqiriladi - shu ekran shunga bog'liq navigatsiyasiz to'g'ridan-to'g'ri
  // ochilmaydi, lekin `selectedDish` turi endi `Dish | null` (boshlang'ich
  // holat), TypeScript uchun aniq tekshiruv kerak.
  if (!selectedDish) return null;

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
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A1F44] via-[#0A1F44]/30 to-transparent" />
        <div className="absolute bottom-8 left-0 w-full px-6 md:px-16">
          <div className="max-w-4xl">
            {selectedDish.isSignature && (
              <span className="font-sans-body text-[11px] font-bold tracking-widest text-[#0077CC] mb-2 block uppercase">
                {t.signatureDishLabel}
              </span>
            )}
            <h1 className="font-serif-display font-bold text-3xl sm:text-5xl text-[#FFFFFF] mb-3">
              {selectedDish.name}
            </h1>
            <p className="font-sans-body text-sm sm:text-base text-[#9FB0C4] max-w-xl leading-relaxed">
              {selectedDish.description}
            </p>
          </div>
        </div>
      </section>

      {/* Details Content Grid */}
      <div className="px-6 md:px-16 -mt-4 relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 max-w-[1440px] mx-auto">
        {/* Left Column */}
        <div className="md:col-span-7 space-y-10">
          {/* Ingredients Bento - local_server hozircha ingredient ro'yxatini
              qo'llamaydi, shu sabab bo'sh bo'lganda butunlay yashiriladi */}
          {selectedDish.ingredients && selectedDish.ingredients.length > 0 && (
          <section>
            <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] mb-4 uppercase">
              {t.ingredients}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {selectedDish.ingredients.map((ing, i) => (
                <div key={i} className="glass-card p-3.5 rounded-xl flex items-center gap-3 border border-[#0077CC]/20">
                  <span className="material-symbols-outlined text-[#0077CC] text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {ing.icon}
                  </span>
                  <span className="font-sans-body text-[11px] font-bold tracking-wider text-[#FFFFFF]">
                    {ing.name}
                  </span>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Chef's Recommendation Card */}
          {selectedDish.chefQuote && (
            <section className="glass-card p-6 sm:p-8 rounded-2xl relative overflow-hidden border border-[#0077CC]/30">
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#0077CC]/10 rotate-45 translate-x-8 -translate-y-8 border-l border-b border-[#0077CC]/30" />
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex-shrink-0 border-2 border-[#0077CC]/40 shadow-xl">
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuA9SLcsVKHqjTDVrWgsUzRk_uKPITtKM6lRWRXW2QC80WqqBzNVcp8iVUgLIn6d8tJlP-z5zwb4Pt3R8y-pr1Lvffn-mB8yvUTHquW_MKHY8lkPN_AMuj8x4_JkOSCYuSJYeKz9J226O_GjJk1OQplwWO2TDQL2TDRoN49H-bgJQZqV5Qd2nKiRjX9mKfDji0omLmECDN49ci8OA0X5TGj2DpIzYGbwBi7WebI7OubTwIdlrLvDREyX8s2EZIogwvs-qfdMGuvvlv4U"
                    alt="Chef Portrait"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-serif-display font-semibold text-xl text-[#FFFFFF] mb-2">
                    {t.chefRecommendation}
                  </h3>
                  <p className="font-sans-body text-xs sm:text-sm text-[#9FB0C4] italic leading-relaxed">
                    "{selectedDish.chefQuote}"
                  </p>
                  {selectedDish.sommelierPairing && (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#0077CC] text-sm">wine_bar</span>
                      <span className="font-sans-body text-[10px] font-bold tracking-widest text-[#0077CC] uppercase">
                        {selectedDish.sommelierPairing}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Nutrition & Allergens - local_server bu ma'lumotlarni
              qo'llamaydi (o'ylab topilgan qiymat ko'rsatilmaydi, masalan
              avval har bir taomga "Halal Certified" deb yozib qo'yilar edi -
              bu tekshirilmagan, noto'g'ri bo'lishi mumkin edi) */}
          {(selectedDish.calories !== undefined || selectedDish.proteinGrams !== undefined || selectedDish.carbsGrams !== undefined
            || (selectedDish.allergens && selectedDish.allergens.length > 0)) && (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {(selectedDish.calories !== undefined || selectedDish.proteinGrams !== undefined || selectedDish.carbsGrams !== undefined) && (
            <div className="space-y-3">
              <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] uppercase mb-3">
                {t.nutritionFacts}
              </h3>
              <div className="space-y-2.5">
                {selectedDish.calories !== undefined && (
                <div className="flex justify-between items-end">
                  <span className="font-sans-body text-xs text-[#9FB0C4]">{t.caloriesLabel}</span>
                  <div className="dotted-leader" />
                  <span className="font-sans-body text-xs font-semibold text-[#FFFFFF]">{selectedDish.calories} kcal</span>
                </div>
                )}
                {selectedDish.proteinGrams !== undefined && (
                <div className="flex justify-between items-end">
                  <span className="font-sans-body text-xs text-[#9FB0C4]">{t.proteinLabel}</span>
                  <div className="dotted-leader" />
                  <span className="font-sans-body text-xs font-semibold text-[#FFFFFF]">{selectedDish.proteinGrams}g</span>
                </div>
                )}
                {selectedDish.carbsGrams !== undefined && (
                <div className="flex justify-between items-end">
                  <span className="font-sans-body text-xs text-[#9FB0C4]">{t.carbsLabel}</span>
                  <div className="dotted-leader" />
                  <span className="font-sans-body text-xs font-semibold text-[#FFFFFF]">{selectedDish.carbsGrams}g</span>
                </div>
                )}
              </div>
            </div>
            )}

            {selectedDish.allergens && selectedDish.allergens.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] uppercase mb-3">
                {t.allergens}
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedDish.allergens.map((alg, idx) => (
                  <span
                    key={idx}
                    className="px-3.5 py-1.5 rounded-full border border-[#0077CC]/30 font-sans-body text-[10px] font-bold tracking-widest text-[#0077CC] uppercase bg-[#0077CC]/5"
                  >
                    {alg}
                  </span>
                ))}
              </div>
            </div>
            )}
          </section>
          )}
        </div>

        {/* Right Column */}
        <aside className="md:col-span-5 space-y-8">
          {/* Portion Size */}
          <div className="glass-card p-6 rounded-2xl border border-[#0077CC]/20">
            <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] mb-4 uppercase">
              {t.portionSize}
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => setPortionSize('Standard')}
                className={`flex-1 py-3 rounded-xl border font-sans-body text-xs font-bold tracking-wider transition-all ${
                  portionSize === 'Standard'
                    ? 'border-[#0077CC] bg-[#0077CC] text-white'
                    : 'border-[#0077CC]/30 text-[#FFFFFF] hover:border-[#0077CC]/60'
                }`}
              >
                STANDARD ({selectedDish.portion})
              </button>
              <button
                onClick={() => setPortionSize('Large')}
                className={`flex-1 py-3 rounded-xl border font-sans-body text-xs font-bold tracking-wider transition-all ${
                  portionSize === 'Large'
                    ? 'border-[#0077CC] bg-[#0077CC] text-white'
                    : 'border-[#0077CC]/30 text-[#FFFFFF] hover:border-[#0077CC]/60'
                }`}
              >
                LARGE (650G)
              </button>
            </div>
          </div>

          {/* Similar Dishes */}
          <div>
            <h3 className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] mb-4 uppercase">
              {t.similarDishes}
            </h3>
            <div className="space-y-4">
              {similarDishes.map((sd) => (
                <div
                  key={sd.id}
                  onClick={() => openDishDetail(sd)}
                  className="group flex gap-4 cursor-pointer glass-card p-3 rounded-xl border border-[#0077CC]/20 hover:border-[#0077CC]/50 transition-all"
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
                      <h4 className="font-serif-display font-semibold text-base text-[#FFFFFF] group-hover:text-[#0077CC] transition-colors">
                        {sd.name}
                      </h4>
                      <p className="font-sans-body text-xs text-[#9FB0C4] line-clamp-1 mt-0.5">
                        {sd.description}
                      </p>
                    </div>
                    <span className="font-sans-body text-xs font-bold text-[#0077CC]">
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
        <div className="max-w-5xl mx-auto glass-card rounded-full p-3 sm:p-4 flex items-center justify-between shadow-2xl pointer-events-auto border border-[#0077CC]/40 bg-[#0A1F44]/90 backdrop-blur-2xl">
          <div className="flex items-center gap-3 ml-2">
            <span className="font-sans-body text-xs font-bold tracking-widest text-[#9FB0C4] uppercase">
              {t.price || "Narxi"}:
            </span>
            <span className="font-serif-display font-bold text-xl sm:text-2xl text-[#0077CC]">
              {selectedDish.priceUZS.toLocaleString()} UZS
            </span>
          </div>

          <button
            onClick={() => setCurrentScreen('menu')}
            className="bg-[#0077CC] text-white px-6 sm:px-8 py-3 rounded-full font-sans-body text-xs font-bold tracking-widest flex items-center gap-2 hover:bg-[#4DA6E0] transition-all active:scale-95 uppercase shadow-lg shadow-[#0077CC]/20"
          >
            <span className="material-symbols-outlined text-lg">restaurant_menu</span>
            <span>{t.exploreMenu || "Menyuga qaytish"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
