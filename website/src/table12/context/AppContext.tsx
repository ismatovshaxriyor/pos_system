import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ScreenView, Language, Dish, CartItem, WaiterRequestHistoryItem } from '../types';
import { TRANSLATIONS } from '../data/mockData';
import { fetchPublicMenu, fetchTableLive, callWaiterApi } from '../services/api';

interface AppContextType {
  currentScreen: ScreenView;
  setCurrentScreen: (screen: ScreenView) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof TRANSLATIONS['EN'];
  dishes: Dish[];
  qrCode: string;
  tableName: string;
  isLiveApiConnected: boolean;
  // Birinchi urinish hali javob bermagan - shu paytda `dishes` bo'sh, hech
  // qanday (haqiqiy ham, soxta ham) taom ko'rsatilmasligi kerak.
  menuLoading: boolean;
  // true faqat ikkala live so'rov (menyu VA stol) muvaffaqiyatsiz tugab,
  // hech qanday haqiqiy taom yuklanmaganda. Endi mock ma'lumot umuman yo'q -
  // shu holatda `dishes` doim bo'sh qoladi, App.tsx to'liq xato holatini
  // ko'rsatadi (LiveDataGate).
  connectionError: boolean;
  retryConnection: () => void;
  selectedDish: Dish | null;
  setSelectedDish: (dish: Dish) => void;
  portionSize: 'Standard' | 'Large';
  setPortionSize: (portion: 'Standard' | 'Large') => void;
  cart: CartItem[];
  addToCart: (dish: Dish, qty?: number, portion?: 'Standard' | 'Large') => void;
  updateCartQuantity: (dishId: string, delta: number) => void;
  removeFromCart: (dishId: string) => void;
  clearCart: () => void;
  favorites: string[];
  toggleFavorite: (dishId: string) => void;
  waiterStatus: 'idle' | 'calling' | 'coming';
  callWaiter: (requestName?: string) => void;
  cancelWaiterCall: () => void;
  waiterHistory: WaiterRequestHistoryItem[];
  toastMessage: string | null;
  showToast: (msg: string) => void;
  
  // Modals
  isCutleryModalOpen: boolean;
  setIsCutleryModalOpen: (open: boolean) => void;
  isFeedbackModalOpen: boolean;
  setIsFeedbackModalOpen: (open: boolean) => void;
  isSplitBillModalOpen: boolean;
  setIsSplitBillModalOpen: (open: boolean) => void;
  isPayModalOpen: boolean;
  setIsPayModalOpen: (open: boolean) => void;
  isOurStoryModalOpen: boolean;
  setIsOurStoryModalOpen: (open: boolean) => void;
  isEmirChamberModalOpen: boolean;
  setIsEmirChamberModalOpen: (open: boolean) => void;

  // Helpers
  subtotalUZS: number;
  serviceFeeUZS: number;
  serviceChargeRate: number;
  totalUZS: number;
  openDishDetail: (dish: Dish) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_CART: CartItem[] = [];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenView>('home');
  const [language, setLanguage] = useState<Language>('UZ');
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [portionSize, setPortionSize] = useState<'Standard' | 'Large'>('Standard');
  const [cart, setCart] = useState<CartItem[]>(INITIAL_CART);
  const [favorites, setFavorites] = useState<string[]>([]);
  
  const [waiterStatus, setWaiterStatus] = useState<'idle' | 'calling' | 'coming'>('idle');
  const [waiterHistory, setWaiterHistory] = useState<WaiterRequestHistoryItem[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLiveApiConnected, setIsLiveApiConnected] = useState(false);
  const [tableName, setTableName] = useState('Stol');
  // Restoranning haqiqiy xizmat haqi foizi (RestaurantConfig.service_charge_rate).
  // Qattiq kodlangan taxmin (masalan 15%) o'rniga jonli qiymat kelguncha 0 -
  // noto'g'ri summa ko'rsatishdan ko'ra hech narsa ko'rsatmagan afzal.
  const [serviceChargeRate, setServiceChargeRate] = useState(0);
  const [menuLoading, setMenuLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const retryConnection = () => setRetryToken((n) => n + 1);

  // Extract QR code from URL path (e.g. /table/<qr_code>/) or query parameters (?qr=... or ?table=... or default 'demo')
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let pathQrCode = null;
  if (pathParts.length >= 2 && pathParts[0] === 'table') {
    pathQrCode = pathParts[1];
  }
  const urlParams = new URLSearchParams(window.location.search);
  const qrCode = pathQrCode || urlParams.get('qr') || urlParams.get('table') || 'demo';

  // Modals state
  const [isCutleryModalOpen, setIsCutleryModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isSplitBillModalOpen, setIsSplitBillModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isOurStoryModalOpen, setIsOurStoryModalOpen] = useState(false);
  const [isEmirChamberModalOpen, setIsEmirChamberModalOpen] = useState(false);

  const t = TRANSLATIONS[language];

  // Fetch real menu and live table state from local_server API
  useEffect(() => {
    let isMounted = true;

    async function loadLiveData() {
      if (isMounted) {
        setConnectionError(false);
        setMenuLoading(true);
      }

      // 1. Fetch live menu items and prices
      const apiDishes = await fetchPublicMenu();
      if (apiDishes && apiDishes.length > 0 && isMounted) {
        setDishes(apiDishes);
        setSelectedDish(apiDishes[0]);
        setIsLiveApiConnected(true);
      }

      // 2. Fetch live table details and current order
      const tableData = await fetchTableLive(qrCode);

      // Ikkalasi ham (menyu VA stol) muvaffaqiyatsiz bo'lsa - haqiqiy
      // ulanish muammosi (agar faqat menyu bo'sh bo'lsa-yu, stol so'rovi
      // muvaffaqiyatli bo'lsa, bu chindan bo'sh menyu, xato emas -
      // MenuScreen o'zining "hozircha taom yo'q" holatini ko'rsatadi).
      if (!(apiDishes && apiDishes.length > 0) && !tableData && isMounted) {
        setConnectionError(true);
      }

      if (isMounted) setMenuLoading(false);

      if (tableData && isMounted) {
        const name = tableData.table_name || tableData.name || 'Stol';
        setTableName(name);
        setIsLiveApiConnected(true);
        setServiceChargeRate(typeof tableData.service_charge_rate === 'number' ? tableData.service_charge_rate : 0);

        const order = tableData.current_order || tableData.active_order;
        if (order && order.items && order.items.length > 0) {
          const liveItems: CartItem[] = order.items.map((item: any) => {
            const priceNum = typeof item.price === 'number' ? item.price : parseFloat(item.price || '0');
            return {
              dish: {
                id: `order-item-${item.id}`,
                name: item.product_name || item.name || 'Taom',
                category: 'Dine-In',
                priceUZS: priceNum,
                description: '',
                portion: '1 ulush',
                prepTimeMinutes: 15,
                calories: 450,
                proteinGrams: 20,
                carbsGrams: 40,
                image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
                ingredients: [],
                allergens: [],
              },
              quantity: item.quantity || 1,
              portionSize: 'Standard',
              priceUZS: priceNum,
            };
          });
          setCart(liveItems);
        } else {
          setCart([]);
        }
      }
    }

    loadLiveData();

    return () => {
      isMounted = false;
    };
  }, [qrCode, retryToken]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const openDishDetail = (dish: Dish) => {
    setSelectedDish(dish);
    setPortionSize('Standard');
    setCurrentScreen('dish-detail');
  };

  const addToCart = (dish: Dish, qty: number = 1, portion: 'Standard' | 'Large' = 'Standard') => {
    const unitPrice = portion === 'Large' ? Math.round(dish.priceUZS * 1.35) : dish.priceUZS;
    setCart((prev) => {
      const existingIndex = prev.findIndex(item => item.dish.id === dish.id && item.portionSize === portion);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += qty;
        return updated;
      } else {
        return [...prev, { dish, quantity: qty, portionSize: portion, priceUZS: unitPrice }];
      }
    });
    showToast(`${dish.name} ${t.added.toLowerCase()}!`);
  };

  const updateCartQuantity = (dishId: string, delta: number) => {
    setCart((prev) => {
      return prev.map(item => {
        if (item.dish.id === dishId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (dishId: string) => {
    setCart((prev) => prev.filter(item => item.dish.id !== dishId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const toggleFavorite = (dishId: string) => {
    setFavorites((prev) =>
      prev.includes(dishId) ? prev.filter(id => id !== dishId) : [...prev, dishId]
    );
  };

  const callWaiter = async (requestName: string = 'Call waiter') => {
    setWaiterStatus('coming');
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    setWaiterHistory(prev => [
      {
        id: Date.now().toString(),
        title: requestName,
        time: `Requested · ${timeString}`,
        status: 'IN_PROGRESS'
      },
      ...prev
    ]);

    // Send real waiter call notification to local_server API
    const apiResult = await callWaiterApi(qrCode, requestName);
    if (apiResult) {
      showToast(apiResult.message || `${requestName} sent to staff`);
    } else {
      showToast(`${requestName} sent to Station 4`);
    }
  };

  const cancelWaiterCall = () => {
    setWaiterStatus('idle');
    showToast('Request cancelled');
  };

  // Financial calculations. Bu - hali serverga yuborilmagan savatcha uchun
  // MIJOZ TOMONIDAGI TAXMIN, real hisob-kitob buyurtma yopilganda backend'da
  // `calculate_order_financials` orqali qilinadi - shuning uchun bu yerda
  // ham xuddi shu manba (RestaurantConfig.service_charge_rate) ishlatilishi
  // shart, aks holda saytda ko'rsatilgan summa haqiqiy chekdan farq qilardi.
  const subtotalUZS = cart.reduce((acc, item) => acc + (item.priceUZS * item.quantity), 0);
  const serviceFeeUZS = Math.round(subtotalUZS * (serviceChargeRate / 100));
  const totalUZS = subtotalUZS + serviceFeeUZS;

  return (
    <AppContext.Provider
      value={{
        currentScreen,
        setCurrentScreen,
        language,
        setLanguage,
        t,
        dishes,
        qrCode,
        tableName,
        isLiveApiConnected,
        menuLoading,
        connectionError,
        retryConnection,
        selectedDish,
        setSelectedDish,
        portionSize,
        setPortionSize,
        cart,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        favorites,
        toggleFavorite,
        waiterStatus,
        callWaiter,
        cancelWaiterCall,
        waiterHistory,
        toastMessage,
        showToast,
        isCutleryModalOpen,
        setIsCutleryModalOpen,
        isFeedbackModalOpen,
        setIsFeedbackModalOpen,
        isSplitBillModalOpen,
        setIsSplitBillModalOpen,
        isPayModalOpen,
        setIsPayModalOpen,
        isOurStoryModalOpen,
        setIsOurStoryModalOpen,
        isEmirChamberModalOpen,
        setIsEmirChamberModalOpen,
        subtotalUZS,
        serviceFeeUZS,
        serviceChargeRate,
        totalUZS,
        openDishDetail,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
