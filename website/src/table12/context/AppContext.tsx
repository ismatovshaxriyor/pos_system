import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ScreenView, Language, Dish, CartItem, WaiterRequestHistoryItem } from '../types';
import { MENU_DISHES, TRANSLATIONS } from '../data/mockData';

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

const INITIAL_CART: CartItem[] = [
  {
    dish: MENU_DISHES[1], // Wedding Plov
    quantity: 2,
    portionSize: 'Standard',
    priceUZS: 120000
  },
  {
    dish: MENU_DISHES[4], // Lamb Kebab
    quantity: 1,
    portionSize: 'Standard',
    priceUZS: 95000
  },
  {
    dish: MENU_DISHES[7], // Green Tea / Saffron Tea
    quantity: 3,
    portionSize: 'Standard',
    priceUZS: 15000
  }
];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenView>('home');
  const [language, setLanguage] = useState<Language>('EN');
  const [selectedDish, setSelectedDish] = useState<Dish>(MENU_DISHES[0]);
  const [portionSize, setPortionSize] = useState<'Standard' | 'Large'>('Standard');
  const [cart, setCart] = useState<CartItem[]>(INITIAL_CART);
  const [favorites, setFavorites] = useState<string[]>(['wedding-plov', 'lamb-kebab']);
  
  const [waiterStatus, setWaiterStatus] = useState<'idle' | 'calling' | 'coming'>('coming');
  const [waiterHistory, setWaiterHistory] = useState<WaiterRequestHistoryItem[]>([
    { id: '1', title: 'Napkin request', time: 'Completed · 19:42', status: 'COMPLETED' },
    { id: '2', title: 'Wine service', time: 'Completed · 19:15', status: 'COMPLETED' }
  ]);

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

  const callWaiter = (requestName: string = 'Call waiter') => {
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

    showToast(`${requestName} sent to Station 4`);
  };

  const cancelWaiterCall = () => {
    setWaiterStatus('idle');
    showToast('Request cancelled');
  };

  // Financial calculations
  const subtotalUZS = cart.reduce((acc, item) => acc + (item.priceUZS * item.quantity), 0);
  const serviceFeeUZS = Math.round(subtotalUZS * 0.15);
  const totalUZS = subtotalUZS + serviceFeeUZS;

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
