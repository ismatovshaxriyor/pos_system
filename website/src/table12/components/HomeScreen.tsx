import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MENU_DISHES } from '../data/mockData';

export const HomeScreen: React.FC = () => {
  const { setCurrentScreen, t, dishes, addToCart, setIsOurStoryModalOpen, setIsEmirChamberModalOpen } = useApp();
  const [activeSlide, setActiveSlide] = useState(0);

  const heroSlides = [
    {
      title: 'Wedding Plov',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAjBNg-KD66pIrve3Tt-SFnY3EyKxsO9X26Ey1lbLKjGhFaWTeck4DU_2OQWT-5heMdgWnWwPLtNMyWcBBICip4dBXAa0Wytjgk0hamHBclayor5Ig4155L0Axj_p_ZVbYDb1CMPadFSot1qyRfD4yq7wCl7KAU5EmCb_uxIoez0JAe-aEBXOxkyre7BCy1rM39hMeu0B36FYLHUoLqRhw-uE2PEWVUiBdhxjJRSD0s8C_3zcoad_saVo_DGXC3V0f1CNQaFdHHRFr8',
    },
    {
      title: 'Kebabs',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA0-Pgxb1wBR3rY1xzPnYVoevZ4AS0uRymKlJh3KmtJbsmYOFI95oQkNvDS6_g7s0gkrqA3jE3yzIFUAmBauaULnbeTn20ZyGDeEFnQ9j8u0jeI3YHWgvOGNMYJpsx31qzILGkI_tdy6yoQM2smKbVFv3HFrfqfn8B9B9h1vjy5RAAOoqhfjNWnIsjy_0OntMY6SH5s5uzqbTqAN9zJlijBVSbZx4qJIQWy0DFC0Q8vbfPHZIL6Yig0yLGPsU0Pj9Zlc8I_o3ykAtYN',
    },
    {
      title: 'Samsa & Manti',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBOZaqYN0H7PxBGPBKxPCcJMgPy7pS8dOSxbvRtKrXRpGlLh1eyVfOvhFFFQjzd1c9Rc1pLylXIbkKZKaFxz2QfAevejo2hhyOvETmyHPiPzMWpRyOmF0GLJh_Dp5Nk_Wdl6K43h95RLbu_6X7jgEC1hD-m7ivHnLqReRqeyIzsxKZ196AZ-OA5QN_FUnIAYbbELMcpjlYrrVK4AskAUSK97SG5J61ZrCz6qD5T9peUAG9v4etYFB4JIlPTEN21CJEl7tTN-5HHx4U5',
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const saffronTeaDish = dishes.length > 0 ? (dishes.find((d) => d.isSignature) || dishes[0]) : null;

  return (
    <div className="relative pt-16 pb-36 min-h-screen">
      {/* Background Oriental Watermark Overlay */}
      <div className="absolute inset-0 oriental-pattern-overlay pointer-events-none opacity-40"></div>

      {/* Hero Cinematic Carousel Section */}
      <section className="relative h-[680px] md:h-[740px] w-full overflow-hidden">
        {/* Carousel Track */}
        <div
          className="flex h-full w-full transition-transform duration-1000 ease-in-out"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          {heroSlides.map((slide, index) => (
            <div key={index} className="min-w-full h-full relative flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-t from-[#001712] via-[#001712]/40 to-[#001712]/20 z-10" />
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-full object-cover object-center scale-105"
              />
            </div>
          ))}
        </div>

        {/* Hero Text Overlay */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto">
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <h1 className="font-serif-display font-bold text-3xl sm:text-5xl md:text-6xl text-[#E3C282] mb-6 leading-tight tracking-tight drop-shadow-md">
              {t.welcomeTitle}
            </h1>
            <p className="font-sans-body text-base sm:text-lg text-[#C1C8C4] max-w-2xl mx-auto mb-10 opacity-90 leading-relaxed">
              {t.welcomeSubtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => setCurrentScreen('menu')}
                className="w-full sm:w-auto bg-[#E6E2D8] text-[#18362E] font-sans-body font-bold text-xs tracking-widest px-10 py-4.5 rounded-full transition-all active:scale-95 hover:bg-white gold-border-glow shadow-xl"
              >
                {t.viewMenu}
              </button>
              <button
                onClick={() => setIsOurStoryModalOpen(true)}
                className="w-full sm:w-auto border border-[#E3C282]/50 text-[#E3C282] font-sans-body font-bold text-xs tracking-widest px-10 py-4.5 rounded-full backdrop-blur-md hover:bg-[#E3C282]/10 transition-all active:scale-95"
              >
                {t.ourStory}
              </button>
            </div>
          </div>
        </div>

        {/* Carousel Indicators */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex gap-2.5">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                activeSlide === i ? 'w-10 bg-[#E3C282]' : 'w-3 bg-[#E3C282]/30'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </section>

      {/* Bento Grid Feature Section */}
      <section className="mt-16 sm:mt-24 px-6 md:px-16 max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Private Dining Card - Emir's Chamber */}
          <div
            onClick={() => setIsEmirChamberModalOpen(true)}
            className="md:col-span-8 group relative overflow-hidden rounded-2xl h-[380px] border border-[#E3C282]/30 glass-card glass-card-hover cursor-pointer"
          >
            <div className="absolute inset-0 opacity-50 group-hover:opacity-65 transition-opacity duration-500">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCxYWunu0KiqkP6Ke2_jpuPLcHDkeunJjQ7rN8j3awbBcF_NtE_T0We7u-sUm1jI--3JGC5oxor8m9i42KqJJqLuzyjMco0CTwS1mftSsZy88kvCxuhjaCKgbJFOWSZ8DJXbxYR6vdoZeEo0_SXoHXgIXaoQyc1SyyCQwnE96UHpGmjOUQyoGrcOfnLy9a08XWDiDLhcSpX608lzx-pDyU44IEgB7GdDJcAgOU_eMFgIYhKuYMcnAPoa4B6QxAF_JY__SegZoGlUtqt"
                alt="Emir's Chamber"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#001712] via-[#001712]/40 to-transparent z-10" />
            <div className="absolute bottom-0 left-0 p-8 z-20">
              <span className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] block mb-2 uppercase">
                {t.privateDiningTitle}
              </span>
              <h2 className="font-serif-display font-semibold text-2xl sm:text-3xl text-[#C7EADE] mb-2">
                {t.emirChamberName}
              </h2>
              <p className="font-sans-body text-sm text-[#C1C8C4] max-w-md">
                {t.emirChamberDesc}
              </p>
            </div>
          </div>

          {/* Chef's Signature Card */}
          <div className="md:col-span-4 glass-card p-8 rounded-2xl flex flex-col justify-between border border-[#E3C282]/30 h-[380px] glass-card-hover">
            <div>
              <span className="material-symbols-outlined text-[#E3C282] text-4xl mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>
                restaurant_menu
              </span>
              <h3 className="font-serif-display font-semibold text-2xl text-[#E3C282] mb-3">
                {t.chefsSignature}
              </h3>
              <p className="font-sans-body text-sm text-[#C1C8C4] leading-relaxed">
                {t.chefsSignatureDesc}
              </p>
            </div>
            <button
              onClick={() => setCurrentScreen('menu')}
              className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] flex items-center gap-2 hover:translate-x-2 transition-transform text-left group uppercase pt-4"
            >
              <span>{t.exploreMenu}</span>
              <span className="material-symbols-outlined text-lg group-hover:text-white">arrow_forward</span>
            </button>
          </div>
        </div>
      </section>

      {/* The Sommelier Selection Component */}
      {saffronTeaDish && (
        <section className="mt-16 sm:mt-24 px-6 md:px-16 max-w-[1440px] mx-auto">
          <div className="relative glass-card p-8 sm:p-12 rounded-2xl border border-[#E3C282]/40 gold-border-glow overflow-hidden">
            {/* Gold Leaf Corner Accent */}
            <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none overflow-hidden">
              <div className="absolute top-0 right-0 w-[150%] h-[150%] bg-gradient-to-br from-[#E3C282]/40 to-transparent rotate-45 transform translate-x-1/2 -translate-y-1/2 border-b border-[#E3C282]/50" />
            </div>

            <div className="flex flex-col md:flex-row gap-8 sm:gap-12 items-center">
              <div className="w-36 h-52 flex-shrink-0 relative rounded-xl overflow-hidden border border-[#E3C282]/30 shadow-2xl">
                <img
                  src={saffronTeaDish.image}
                  alt={saffronTeaDish.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <span className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] mb-2 block uppercase">
                  {t.sommelierSelection}
                </span>
                <h3 className="font-serif-display font-semibold text-2xl sm:text-3xl text-[#C7EADE] mb-3">
                  {saffronTeaDish.name}
                </h3>
                <p className="font-sans-body text-sm text-[#C1C8C4] mb-6 leading-relaxed">
                  {saffronTeaDish.description}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-serif-display font-bold text-2xl text-[#E3C282]">
                    {saffronTeaDish.priceUZS.toLocaleString()} UZS
                  </span>
                  <span className="h-px flex-grow bg-[#E3C282]/30 min-w-[30px]" />
                  <button
                    onClick={() => addToCart(saffronTeaDish)}
                    className="font-sans-body text-xs font-bold tracking-widest border border-[#E3C282]/60 px-6 py-2.5 rounded-full hover:bg-[#E3C282] text-[#C7EADE] hover:text-[#001712] transition-colors active:scale-95 uppercase"
                  >
                    {t.addOrder}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
