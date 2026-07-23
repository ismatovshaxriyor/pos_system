import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MENU_DISHES } from '../data/mockData';
import { Dish } from '../types';

export const MenuScreen: React.FC = () => {
  const {
    t,
    dishes,
    openDishDetail,
    addToCart,
    favorites,
    toggleFavorite,
    showToast
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  const categories = ['All', ...Array.from(new Set(dishes.map((d) => d.category)))];

  const filteredDishes = dishes.filter((dish) => {
    const matchesCategory = selectedCategory === 'All' || dish.category === selectedCategory;
    const matchesSearch =
      dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dish.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleQtyChange = (dishId: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuantities((prev) => {
      const current = prev[dishId] || 1;
      return { ...prev, [dishId]: Math.max(1, current + delta) };
    });
  };

  const handleAddDish = (dish: Dish, e: React.MouseEvent) => {
    e.stopPropagation();
    const qty = quantities[dish.id] || 1;
    addToCart(dish, qty);

    setAddedIds((prev) => ({ ...prev, [dish.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [dish.id]: false }));
    }, 1800);
  };

  return (
    <div className="pt-20 pb-40 px-6 md:px-16 max-w-[1440px] mx-auto min-h-screen animate-in fade-in duration-300">
      {/* Sticky Search Bar */}
      <div className="sticky top-16 z-40 bg-[#001712]/90 backdrop-blur-md py-4 -mx-6 px-6 md:-mx-16 md:px-16">
        <div className="relative w-full max-w-2xl mx-auto">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#C1C8C4]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full bg-[#002019] border-b border-[#E3C282]/30 focus:border-[#E3C282] focus:outline-none text-sm text-[#C7EADE] py-3.5 pl-12 pr-4 transition-all rounded-t-lg font-sans-body"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C1C8C4] hover:text-[#E3C282]"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Category Filter Pills */}
      <nav className="sticky top-[136px] z-30 bg-[#001712]/90 backdrop-blur-md py-4 -mx-6 px-6 md:-mx-16 md:px-16 flex overflow-x-auto hide-scrollbar gap-6 sm:gap-8 items-center border-b border-[#E3C282]/15">
        {categories.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`font-sans-body text-xs font-bold tracking-widest uppercase whitespace-nowrap transition-all pb-2 ${
                isActive
                  ? 'text-[#E3C282] border-b-2 border-[#E3C282]'
                  : 'text-[#C1C8C4] hover:text-[#E3C282]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </nav>

      {/* Category Section Header */}
      <section className="mt-8 sm:mt-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif-display font-semibold text-2xl sm:text-3xl text-[#ADCDC3]">
            {selectedCategory === 'Plov' ? t.masterPlovSelection : `${selectedCategory} Selection`}
          </h2>
          <div className="h-px bg-[#E3C282]/20 flex-grow ml-6 hidden sm:block" />
        </div>

        {/* Dish Grid */}
        {filteredDishes.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center border border-[#E3C282]/30 max-w-md mx-auto my-12">
            <span className="material-symbols-outlined text-[#E3C282] text-5xl mb-4">
              restaurant_menu
            </span>
            <h3 className="font-serif-display font-semibold text-2xl text-[#E3C282] mb-2">
              Hozircha taomlar mavjud emas
            </h3>
            <p className="font-sans-body text-xs text-[#C1C8C4] opacity-80">
              Restoran menyusiga hali taomlar qo'shilmadi yoki tanlangan kategoriya bo'sh.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
            {filteredDishes.map((dish) => {
              const isFav = favorites.includes(dish.id);
              const qty = quantities[dish.id] || 1;
              const isAdded = addedIds[dish.id];

              return (
              <div
                key={dish.id}
                onClick={() => openDishDetail(dish)}
                className="glass-card rounded-2xl overflow-hidden group flex flex-col h-full border border-[#E3C282]/30 shadow-xl cursor-pointer glass-card-hover"
              >
                {/* Photo Header */}
                <div className="relative h-64 overflow-hidden">
                  <div className="absolute top-4 right-4 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(dish.id);
                      }}
                      className="bg-[#001712]/60 backdrop-blur-md p-2 rounded-full text-[#E3C282] hover:scale-110 transition-transform active:scale-95"
                      aria-label="Favorite"
                    >
                      <span
                        className={`material-symbols-outlined text-xl ${isFav ? 'filled text-red-400' : ''}`}
                      >
                        favorite
                      </span>
                    </button>
                  </div>

                  <img
                    src={dish.image}
                    alt={dish.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#001712] to-transparent h-20" />
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-grow">
                  <div className="flex items-baseline mb-2">
                    <h3 className="font-serif-display font-semibold text-xl text-[#C7EADE] group-hover:text-[#E3C282] transition-colors">
                      {dish.name}
                    </h3>
                    <span className="dotted-leader" />
                    <span className="font-serif-display font-bold text-lg text-[#E3C282] whitespace-nowrap">
                      {dish.priceUZS.toLocaleString()} UZS
                    </span>
                  </div>

                  <p className="font-sans-body text-xs text-[#C1C8C4] mb-6 leading-relaxed line-clamp-2">
                    {dish.description}
                  </p>

                  {/* Spec Specs Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-6 text-center bg-[#00110D]/40 p-2.5 rounded-xl border border-[#E3C282]/10">
                    <div className="flex flex-col">
                      <span className="font-sans-body text-[9px] font-bold tracking-widest text-[#E3C282]/70 uppercase">
                        PORTION
                      </span>
                      <span className="font-sans-body text-xs text-[#C7EADE] font-medium">{dish.portion}</span>
                    </div>
                    <div className="flex flex-col border-x border-[#E3C282]/10">
                      <span className="font-sans-body text-[9px] font-bold tracking-widest text-[#E3C282]/70 uppercase">
                        TIME
                      </span>
                      <span className="font-sans-body text-xs text-[#C7EADE] font-medium">{dish.prepTimeMinutes} min</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-sans-body text-[9px] font-bold tracking-widest text-[#E3C282]/70 uppercase">
                        CALORIES
                      </span>
                      <span className="font-sans-body text-xs text-[#C7EADE] font-medium">{dish.calories} kcal</span>
                    </div>
                  </div>

                  {/* Price & Details Action */}
                  <div className="mt-auto flex items-center justify-between pt-4 border-t border-[#E3C282]/15">
                    <span className="font-serif-display font-bold text-lg text-[#E3C282]">
                      {dish.priceUZS.toLocaleString()} <span className="text-xs font-sans-body">UZS</span>
                    </span>

                    <button
                      onClick={() => openDishDetail(dish)}
                      className="px-5 py-2 rounded-full bg-[#E3C282]/15 text-[#E3C282] border border-[#E3C282]/40 font-sans-body text-xs font-bold tracking-widest hover:bg-[#E3C282] hover:text-[#001712] transition-all active:scale-95 uppercase flex items-center gap-1.5"
                    >
                      <span>Batafsil</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </section>

      {/* Sommelier Pairing Feature Section */}
      <section className="mt-16 sm:mt-24">
        <div className="glass-card rounded-2xl p-8 sm:p-12 relative overflow-hidden flex flex-col md:flex-row items-center gap-10 border border-[#E3C282]/40">
          <div className="w-full md:w-1/3 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl relative border border-[#E3C282]/30">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuABXg1trnQrav0wfmrXTjkSKqXTM1m2qjes4uQelbrmlqdZI-8_v4kKNHIcD8zZJnTxPqmTEbOYbjbsPY_DF2soPFVpEX3LtF8TUg6Dgwzsc-WXTr0iKWz8Bb4VEQtnLISKcaTo8Z0VfIE_GVCJVLfnBjHZffRxFXS1ZvbRTwspd9EzauWvLtibjTuLQO_wtFVHT3KL32zI1ntK1Qn8vA9Jjh38odcdpBRYPTHDumixJV-B0xxaxGCHKPn8l5dysd0wiyiOw5Pr9B-y"
              alt="Wine Pairing"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="w-full md:w-2/3">
            <span className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] mb-3 block uppercase">
              {t.sommelierSelection}
            </span>
            <h2 className="font-serif-display font-semibold text-2xl sm:text-4xl text-[#C7EADE] mb-4">
              Pairing Recommendation
            </h2>
            <p className="font-sans-body text-sm text-[#C1C8C4] mb-8 max-w-xl leading-relaxed">
              To elevate the rich flavors of our Wedding Plov, our Sommelier recommends the 2018 Bagizagan Reserve. A complex red with notes of dark berries and local spices.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => showToast('2018 Bagizagan Bottle added to order')}
                className="bg-[#E3C282] text-[#001712] px-8 py-3.5 rounded-full font-sans-body text-xs font-bold tracking-widest hover:bg-[#FFDEA0] transition-all uppercase"
              >
                ADD BOTTLE • 450,000 UZS
              </button>
              <button
                onClick={() => showToast('2018 Bagizagan Glass added to order')}
                className="border border-[#E3C282] text-[#E3C282] px-8 py-3.5 rounded-full font-sans-body text-xs font-bold tracking-widest hover:bg-[#E3C282]/10 transition-all uppercase"
              >
                BY GLASS • 85,000 UZS
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
