import { MobileAppEntry } from './types';

export const MOCK_APPS: MobileAppEntry[] = [
  {
    slug: 'manager', name: 'Manager', role: 'Restoran egasi va menejer', version: '2.4.1', platform: 'android',
    size_mb: '28.6', released_at: '2026-07-28T10:00:00+05:00', min_os: 'Android 8.0', is_required: false, download_url: '#',
    notes: ["Filiallar bo'yicha solishtirma savdo hisoboti", "Menyu narxini ommaviy o'zgartirish", 'Smena yopilishida avtomatik xabarnoma'],
  },
  {
    slug: 'kassir', name: 'Kassir', role: 'Kassa va to\'lovlar', version: '2.4.0', platform: 'android',
    size_mb: '24.2', released_at: '2026-07-24T10:00:00+05:00', min_os: 'Android 8.0', is_required: true, download_url: '#',
    notes: ['Hisobni bo\'lib to\'lash (split-bill)', 'Fiskal chek shabloni yangilandi', 'Offline navbat tiklanishi tezlashtirildi'],
  },
  {
    slug: 'ofitsiant', name: 'Ofitsiant', role: 'Zal va buyurtmalar', version: '2.3.7', platform: 'android',
    size_mb: '19.8', released_at: '2026-07-19T10:00:00+05:00', min_os: 'Android 8.0', is_required: false, download_url: '#',
    notes: ["Stol chaqiruvlari jonli ro'yxati", 'Buyurtmaga izoh va modifikator qo\'shish', 'QR stol kodini skanerlash'],
  },
];
