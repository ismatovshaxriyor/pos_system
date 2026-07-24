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

// Backend API response types (local_server public APIs)
export interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string | number;
  image?: string | null;
  is_available: boolean;
  preparation_time?: number;
}

export interface ApiCategory {
  id: number;
  name: string;
  image?: string | null;
  products: ApiProduct[];
}

export interface ApiOrderItem {
  id: number;
  product_name: string;
  quantity: number;
  price: string | number;
  total: string | number;
  note?: string;
}

export interface ApiActiveOrder {
  id: number;
  status: string;
  items: ApiOrderItem[];
  subtotal: string | number;
  service_fee: string | number;
  total_amount: string | number;
  balance_due: string | number;
}

export interface ApiTableLive {
  id: number;
  name: string;
  qr_code: string;
  active_order: ApiActiveOrder | null;
}

