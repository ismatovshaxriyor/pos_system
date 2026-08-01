export type TabView = 'menu' | 'bill';

export interface Product {
  id: number;
  name: string;
  price: string;
  image: string | null;
  barcode: string;
  is_available: boolean;
}

export interface Category {
  id: number;
  name: string;
  image: string | null;
  products: Product[];
}

export type OrderItemStatus = 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled';

export interface OrderItem {
  id: number;
  product_name: string;
  quantity: number;
  price: string;
  status: OrderItemStatus;
  modifiers: Record<string, unknown>;
  is_printed: boolean;
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export interface LiveOrder {
  id: number;
  status: string;
  order_type: OrderType;
  items: OrderItem[];
  tax_amount: string;
  service_charge: string;
  discount_amount: string;
  total_amount: string;
  final_amount: string;
  created_at: string;
}

export interface TableLive {
  table_id: number;
  table_name: string;
  zone_name: string;
  qr_code: string;
  current_order: LiveOrder | null;
  service_charge_rate: number;
}
