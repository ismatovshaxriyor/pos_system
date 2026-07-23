import React, { useState, useEffect } from 'react';

// Sample fallback menu data if restaurant has no custom synced menu yet
const DEFAULT_MENU_ITEMS = [
  { id: 1, category: 'taomlar', name: 'Osh (Palov) Special', price: 45000, desc: 'Lasur guruch, sarxil mol go\'shti, devzira va yangi sabzi', icon: '🍲', popular: true },
  { id: 2, category: 'taomlar', name: 'Manti (Mol go\'shtli)', price: 38000, desc: 'Yumshoq xamir ichida tuyg\'un mol go\'shti va piyoz (5 dona)', icon: '🥟', popular: true },
  { id: 3, category: 'taomlar', name: 'Shashlik (Qiyma & G\'ijduvon)', price: 22000, desc: 'Ko\'mir cho\'g\'ida pishirilgan haqiqiy shashlik (1 six)', icon: '🍢' },
  { id: 4, category: 'salatlar', name: 'Achchiq-Chuchuk (Shakarob)', price: 15000, desc: 'Yangi pomidor, bodring va nozik to\'g\'ralgan piyoz', icon: '🥗' },
  { id: 5, category: 'salatlar', name: 'Cezar Salati (Tovuqli)', price: 35000, desc: 'Qovurilgan tovuq go\'shti, parmezan va suxariklar', icon: '🥗' },
  { id: 6, category: 'ichimliklar', name: 'Ko\'k Choy (Limonli)', price: 8000, desc: 'Farg\'ona ko\'k choyi va yangi kesilgan limon', icon: '🫖' },
  { id: 7, category: 'ichimliklar', name: 'Moxito (Klassik & Yalpizli)', price: 25000, desc: 'Limon, yalpiz va muzli tetiklashtiruvchi ichimlik', icon: '🍹', popular: true },
  { id: 8, category: 'shirinliklar', name: 'Medovik Tort', price: 28000, desc: 'Asalli va nozik krem bilan tayyorlangan shirinlik', icon: '🍰' },
];

export default function RestaurantMenu({ subdomain }) {
  const [restaurantName, setRestaurantName] = useState(subdomain ? subdomain.toUpperCase() : 'Restoran Menu');
  const [activeCategory, setActiveCategory] = useState('barchasi');
  const [cart, setCart] = useState([]);
  const [selectedTable, setSelectedTable] = useState('1');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('click');
  const [menuItems, setMenuItems] = useState(DEFAULT_MENU_ITEMS);

  useEffect(() => {
    // Attempt to fetch public restaurant data & menu from Ona server API
    const fetchRestaurantInfo = async () => {
      try {
        const res = await fetch(`https://api.hamrohpos.uz/api/sync/public/check-subdomain/?subdomain=${subdomain}`);
        if (res.ok) {
          const data = await res.json();
          if (data.subdomain) {
            const formatted = data.subdomain.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            setRestaurantName(formatted);
          }
        }
      } catch (e) {
        console.log("Subdomain info fetch fallback");
      }
    };

    if (subdomain) {
      fetchRestaurantInfo();
    }
  }, [subdomain]);

  const categories = [
    { id: 'barchasi', label: 'Barchasi', icon: '🍽️' },
    { id: 'taomlar', label: 'Taomlar', icon: '🍲' },
    { id: 'salatlar', label: 'Salatlar', icon: '🥗' },
    { id: 'ichimliklar', label: 'Ichimliklar', icon: '🍹' },
    { id: 'shirinliklar', label: 'Shirinliklar', icon: '🍰' },
  ];

  const filteredItems = activeCategory === 'barchasi'
    ? menuItems
    : menuItems.filter(item => item.category === activeCategory);

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing.qty === 1) {
        return prev.filter(i => i.id !== itemId);
      }
      return prev.map(i => i.id === itemId ? { ...i, qty: i.qty - 1 } : i);
    });
  };

  const getItemQty = (itemId) => {
    const item = cart.find(i => i.id === itemId);
    return item ? item.qty : 0;
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const handleCheckout = () => {
    setIsCartOpen(false);
    setIsSuccessModalOpen(true);
    setCart([]);
  };

  return (
    <div className="min-h-screen bg-[#001712] text-[#c7eade] font-sans pb-28">
      {/* Header Banner */}
      <header className="relative bg-gradient-to-b from-[#002b22] to-[#001712] border-b border-[#144e3f] pt-8 pb-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-center md:text-left">
            <div className="w-16 h-16 rounded-2xl bg-[#e3c282]/10 border border-[#e3c282]/30 flex items-center justify-center text-3xl shadow-lg">
              🏪
            </div>
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{restaurantName}</h1>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-medium">
                  ● Onlayn
                </span>
              </div>
              <p className="text-xs text-[#8ab8a8] mt-1 flex items-center justify-center md:justify-start gap-2">
                <span>Raqamli Menyusi va Onlayn To'lov</span>
                <span>•</span>
                <span className="text-[#e3c282] font-mono">{subdomain}.hamrohpos.uz</span>
              </p>
            </div>
          </div>

          {/* Table / Location Selector */}
          <div className="bg-[#002b22] border border-[#144e3f] p-2 rounded-xl flex items-center gap-2">
            <span className="text-xs text-[#8ab8a8] pl-2 font-medium">Joylashuv:</span>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="bg-[#001712] border border-[#144e3f] text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#e3c282]"
            >
              <option value="1">🪑 Stol #1</option>
              <option value="2">🪑 Stol #2</option>
              <option value="3">🪑 Stol #3</option>
              <option value="vip">⭐ VIP Xona #1</option>
              <option value="takeaway">🛍️ Olib ketish (Takeaway)</option>
            </select>
          </div>
        </div>
      </header>

      {/* Category Tabs */}
      <nav className="sticky top-0 z-30 bg-[#001712]/90 backdrop-blur-md border-b border-[#144e3f]/60 py-3 px-4 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-gradient-to-r from-[#e3c282] to-[#cba460] text-[#001712] font-semibold shadow-lg shadow-[#e3c282]/20'
                  : 'bg-[#002b22] text-[#c7eade] hover:bg-[#003b2f] border border-[#144e3f]'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Menu Grid */}
      <main className="max-w-4xl mx-auto px-4 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map(item => {
            const qty = getItemQty(item.id);
            return (
              <div
                key={item.id}
                className="bg-[#002b22] border border-[#144e3f] hover:border-[#10b981]/50 p-4 rounded-2xl flex items-start gap-4 transition-all hover:shadow-xl relative overflow-hidden group"
              >
                {item.popular && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-[#e3c282] to-[#cba460] text-[#001712] text-[10px] font-bold px-3 py-0.5 rounded-bl-xl shadow-sm">
                    TOP TAOM
                  </div>
                )}
                <div className="w-20 h-20 rounded-xl bg-[#001712] border border-[#144e3f] flex items-center justify-center text-4xl flex-shrink-0 group-hover:scale-105 transition-transform">
                  {item.icon}
                </div>
                <div className="flex-1 flex flex-col justify-between h-full min-h-[80px]">
                  <div>
                    <h3 className="text-base font-semibold text-white group-hover:text-[#e3c282] transition-colors">{item.name}</h3>
                    <p className="text-xs text-[#8ab8a8] mt-1 line-clamp-2">{item.desc}</p>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#144e3f]/40">
                    <span className="text-sm font-bold text-white font-mono">{item.price.toLocaleString()} so'm</span>
                    
                    {qty === 0 ? (
                      <button
                        onClick={() => addToCart(item)}
                        className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/40 text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1"
                      >
                        <span>+</span> Qo'shish
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-[#001712] border border-[#10b981]/40 rounded-xl p-1">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-6 h-6 rounded-lg bg-[#002b22] text-emerald-400 font-bold hover:bg-emerald-600 hover:text-white transition-colors text-xs"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold text-white font-mono px-1">{qty}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-colors text-xs"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Floating Bottom Cart Bar */}
      {totalCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-lg mx-auto">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white p-4 rounded-2xl shadow-2xl shadow-emerald-900/50 flex items-center justify-between border border-emerald-400/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 text-white font-bold text-xs px-3 py-1 rounded-xl font-mono">
                {totalCount} ta
              </div>
              <span className="font-semibold text-sm">Savatni Ko'rish & To'lash</span>
            </div>
            <div className="font-bold text-base font-mono">
              {totalAmount.toLocaleString()} so'm →
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer / Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#002b22] border border-[#144e3f] w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#144e3f]">
              <div>
                <h2 className="text-xl font-bold text-white">Savat & Buyurtma</h2>
                <p className="text-xs text-[#8ab8a8] mt-0.5">{selectedTable === 'takeaway' ? 'Olib ketish' : `Stol #${selectedTable}`}</p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-[#001712] text-[#8ab8a8] hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Cart Items List */}
            <div className="max-h-60 overflow-y-auto my-4 space-y-3 pr-1">
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-[#001712] p-3 rounded-xl border border-[#144e3f]/60">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{item.name}</h4>
                      <p className="text-xs text-[#8ab8a8] font-mono">{item.price.toLocaleString()} so'm</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="w-6 h-6 rounded-lg bg-[#002b22] text-emerald-400 font-bold hover:bg-emerald-600 hover:text-white transition-colors text-xs"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold text-white font-mono px-1">{item.qty}</span>
                    <button
                      onClick={() => addToCart(item)}
                      className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-colors text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment Method Selector */}
            <div className="my-4 pt-4 border-t border-[#144e3f]">
              <label className="text-xs font-semibold text-[#8ab8a8] uppercase tracking-wider block mb-2">To'lov Usuli</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPaymentMethod('click')}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    paymentMethod === 'click'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                      : 'bg-[#001712] border-[#144e3f] text-[#8ab8a8]'
                  }`}
                >
                  <span className="text-base">💳</span> Click
                </button>
                <button
                  onClick={() => setPaymentMethod('payme')}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    paymentMethod === 'payme'
                      ? 'bg-teal-600/20 border-teal-500 text-teal-400'
                      : 'bg-[#001712] border-[#144e3f] text-[#8ab8a8]'
                  }`}
                >
                  <span className="text-base">🟢</span> Payme
                </button>
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                    paymentMethod === 'cash'
                      ? 'bg-[#e3c282]/20 border-[#e3c282] text-[#e3c282]'
                      : 'bg-[#001712] border-[#144e3f] text-[#8ab8a8]'
                  }`}
                >
                  <span className="text-base">💵</span> Kassada
                </button>
              </div>
            </div>

            {/* Summary & Order Action */}
            <div className="pt-3 border-t border-[#144e3f]">
              <div className="flex items-center justify-between text-sm mb-4">
                <span className="text-[#8ab8a8]">Jami Summa:</span>
                <span className="text-xl font-bold text-white font-mono">{totalAmount.toLocaleString()} so'm</span>
              </div>
              <button
                onClick={handleCheckout}
                className="w-full bg-gradient-to-r from-[#e3c282] to-[#cba460] hover:from-[#f0d398] hover:to-[#dbb570] text-[#001712] font-bold py-3.5 rounded-xl shadow-lg transition-all"
              >
                Buyurtma Berish & To'lash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Confirmation Modal */}
      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#002b22] border border-emerald-500/40 w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-3xl mx-auto mb-4">
              ✓
            </div>
            <h3 className="text-xl font-bold text-white">Buyurtma Yuborildi!</h3>
            <p className="text-xs text-[#8ab8a8] mt-2 leading-relaxed">
              Buyurtmangiz restoranning oshxona va kassa POS tizimiga muvaffaqiyatli uzatildi. Rahmat!
            </p>
            <div className="mt-6 pt-4 border-t border-[#144e3f]">
              <button
                onClick={() => setIsSuccessModalOpen(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
