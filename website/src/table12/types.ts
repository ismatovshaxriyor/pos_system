export type ScreenView = 'home' | 'menu' | 'dish-detail' | 'bill' | 'waiter';

export type Language = 'EN' | 'UZ' | 'RU';

export interface Ingredient {
  name: string;
  icon: string;
}

export interface Dish {
  id: string;
  name: string;
  category: 'Plov' | 'Kebabs' | 'Manti' | 'Soups' | 'Salads' | 'Desserts' | 'Tea' | 'Drinks';
  priceUZS: number;
  description: string;
  portion: string;
  prepTimeMinutes: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  image: string;
  isSignature?: boolean;
  ingredients: Ingredient[];
  chefQuote?: string;
  sommelierPairing?: string;
  allergens: string[];
}

export interface CartItem {
  dish: Dish;
  quantity: number;
  portionSize: 'Standard' | 'Large';
  priceUZS: number;
}

export interface WaiterRequestHistoryItem {
  id: string;
  title: string;
  time: string;
  status: 'COMPLETED' | 'IN_PROGRESS';
}

export interface TableOrder {
  tableNumber: number;
  station: number;
  dateTime: string;
  items: CartItem[];
  subtotalUZS: number;
  serviceFeePercent: number;
  totalUZS: number;
}
