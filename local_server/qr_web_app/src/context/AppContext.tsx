import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ScreenView, Language, Dish, CartItem, WaiterRequestHistoryItem } from '../types';
import { MENU_DISHES, TRANSLATIONS } from '../data/mockData';
import { fetchTableLive } from '../api';

interface AppContextType {
  currentScreen: ScreenView;
  setCurrentScreen: (screen: ScreenView) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof TRANSLATIONS['EN'];
  selectedDish: Dish;
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
  tableInfo: { tableName: string; zoneName: string } | null;
  
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
  totalUZS: number;
  openDishDetail: (dish: Dish) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_CART: CartItem[] = [];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenView>('home');
  const [language, setLanguage] = useState<Language>('UZ');
  const [selectedDish, setSelectedDish] = useState<Dish>(MENU_DISHES[0]);
  const [portionSize, setPortionSize] = useState<'Standard' | 'Large'>('Standard');
  const [cart, setCart] = useState<CartItem[]>(INITIAL_CART);
  const [favorites, setFavorites] = useState<string[]>([]);
  
  const [waiterStatus, setWaiterStatus] = useState<'idle' | 'calling' | 'coming'>('idle');
  const [waiterHistory, setWaiterHistory] = useState<WaiterRequestHistoryItem[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isCutleryModalOpen, setIsCutleryModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isSplitBillModalOpen, setIsSplitBillModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isOurStoryModalOpen, setIsOurStoryModalOpen] = useState(false);
  const [isEmirChamberModalOpen, setIsEmirChamberModalOpen] = useState(false);

  const t = TRANSLATIONS[language];

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

  const getQrCodeFromUrl = () => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('table')) return searchParams.get('table')!;
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const tableIndex = pathParts.indexOf('table');
    if (tableIndex !== -1 && pathParts[tableIndex + 1]) {
      return pathParts[tableIndex + 1];
    }
    return 'demo';
  };

  const callWaiter = (requestName: string = 'Ofitsiant chaqiruvi') => {
    setWaiterStatus('coming');
    const qrCode = getQrCodeFromUrl();

    // Real-time POST to Django API
    fetch(`/api/public/table/${qrCode}/call-waiter/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: requestName }),
    }).catch(err => console.error("Call waiter API error:", err));

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    setWaiterHistory(prev => [
      {
        id: Date.now().toString(),
        title: requestName,
        time: `Yuborildi · ${timeString}`,
        status: 'IN_PROGRESS'
      },
      ...prev
    ]);

    showToast(`${requestName} yuborildi`);
  };

  const [tableInfo, setTableInfo] = useState<{ tableName: string; zoneName: string } | null>(null);
  const [liveOrder, setLiveOrder] = useState<any>(null);

  useEffect(() => {
    const qrCode = getQrCodeFromUrl();
    if (qrCode && qrCode !== 'demo') {
      fetchTableLive(qrCode)
        .then((data) => {
          if (data) {
            setTableInfo({
              tableName: data.table_name || '',
              zoneName: data.zone_name || ''
            });
            if (data.current_order && data.current_order.items && data.current_order.items.length > 0) {
              setLiveOrder(data.current_order);
              const mappedItems: CartItem[] = data.current_order.items.map((item: any) => ({
                dish: {
                  id: String(item.id),
                  name: item.product_name,
                  category: 'ordered',
                  priceUZS: parseFloat(item.price),
                  description: '',
                  image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
                  rating: 5,
                  prepTime: '15 min'
                },
                quantity: item.quantity,
                portionSize: 'Standard',
                priceUZS: parseFloat(item.price)
              }));
              setCart(mappedItems);
            } else {
              setCart([]);
            }
          }
        })
        .catch((err) => console.error("Error fetching live table order:", err));
    }
  }, []);

  const cancelWaiterCall = () => {
    setWaiterStatus('idle');
    showToast('Request cancelled');
  };

  // Financial calculations
  const subtotalUZS = cart.reduce((acc, item) => acc + (item.priceUZS * item.quantity), 0);
  const serviceFeeUZS = liveOrder && liveOrder.service_charge
    ? parseFloat(liveOrder.service_charge)
    : Math.round(subtotalUZS * 0.10);
  const totalUZS = liveOrder && liveOrder.final_amount
    ? parseFloat(liveOrder.final_amount)
    : subtotalUZS + serviceFeeUZS;

  return (
    <AppContext.Provider
      value={{
        currentScreen,
        setCurrentScreen,
        language,
        setLanguage,
        t,
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
        tableInfo,
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
