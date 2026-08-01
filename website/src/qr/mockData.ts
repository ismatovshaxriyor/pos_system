import { Category, TableLive } from '../types';

/** Backend ulanmagan holatda (dev/demo) ko'rsatiladigan namunaviy ma'lumot. */
export const MOCK_MENU: Category[] = [
  {
    id: 1, name: 'Issiq taomlar', image: null,
    products: [
      { id: 5, name: 'Norin', price: '42000.00', image: null, barcode: '', is_available: true },
      { id: 6, name: "Lag'mon", price: '38000.00', image: null, barcode: '', is_available: true },
      { id: 7, name: 'Osh', price: '35000.00', image: null, barcode: '', is_available: true },
      { id: 8, name: 'Manti', price: '32000.00', image: null, barcode: '', is_available: true },
      { id: 9, name: 'Shashlik', price: '28000.00', image: null, barcode: '', is_available: false },
      { id: 10, name: 'Chuchvara', price: '30000.00', image: null, barcode: '', is_available: true },
    ],
  },
  {
    id: 2, name: 'Salatlar', image: null,
    products: [
      { id: 11, name: 'Achchiq-chuchuk', price: '18000.00', image: null, barcode: '', is_available: true },
      { id: 12, name: 'Olivye', price: '22000.00', image: null, barcode: '', is_available: true },
      { id: 13, name: 'Bodring-pomidor', price: '16000.00', image: null, barcode: '', is_available: true },
      { id: 14, name: 'Sezar', price: '34000.00', image: null, barcode: '', is_available: true },
    ],
  },
  {
    id: 3, name: 'Ichimliklar', image: null,
    products: [
      { id: 15, name: 'Ayron', price: '12000.00', image: null, barcode: '4780012340015', is_available: true },
      { id: 16, name: "Ko'k choy", price: '8000.00', image: null, barcode: '', is_available: true },
      { id: 17, name: 'Kompot', price: '10000.00', image: null, barcode: '', is_available: true },
      { id: 18, name: 'Suv 0.5', price: '6000.00', image: null, barcode: '4780012340022', is_available: true },
    ],
  },
  {
    id: 4, name: 'Shirinliklar', image: null,
    products: [
      { id: 19, name: 'Chak-chak', price: '20000.00', image: null, barcode: '', is_available: true },
      { id: 20, name: 'Muzqaymoq', price: '18000.00', image: null, barcode: '', is_available: true },
      { id: 21, name: 'Bodom halvo', price: '24000.00', image: null, barcode: '', is_available: false },
    ],
  },
];

export function mockTable(qrCode: string, empty: boolean): TableLive {
  return {
    table_id: 12,
    table_name: '12',
    zone_name: 'VIP',
    qr_code: qrCode,
    service_charge_rate: 10,
    current_order: empty ? null : {
      id: 148,
      status: 'in_progress',
      order_type: 'dine_in',
      items: [
        { id: 1, product_name: 'Norin', quantity: 2, price: '42000.00', status: 'ready', modifiers: {}, is_printed: true },
        { id: 2, product_name: "Lag'mon", quantity: 1, price: '38000.00', status: 'new', modifiers: {}, is_printed: true },
        { id: 3, product_name: 'Ayron', quantity: 2, price: '12000.00', status: 'ready', modifiers: {}, is_printed: true },
      ],
      tax_amount: '0.00',
      service_charge: '14600.00',
      discount_amount: '0.00',
      total_amount: '146000.00',
      final_amount: '160600.00',
      created_at: new Date().toISOString(),
    },
  };
}
