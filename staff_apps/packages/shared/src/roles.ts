import type { Role, User } from './types';

/**
 * Qaysi ilovada qaysi rol ishlaydi (mahsulot qarori):
 *  - `mobile`  (Expo)     - menejer(admin) + ofitsiant
 *  - `cashier` (Electron) - kassir + menejer (backend `IsCashierOrManager`
 *    menejerga ham kassa huquqini beradi)
 *
 * Bu faqat UI'ni yo'naltiradi. Haqiqiy huquq tekshiruvi doim serverda
 * (`core/permissions.py`) - klient tekshiruvi xavfsizlik chegarasi emas.
 */
export type AppKind = 'mobile' | 'cashier';

const APP_ROLES: Record<AppKind, readonly Role[]> = {
  mobile: ['manager', 'waiter'],
  cashier: ['cashier', 'manager'],
};

export function canUseApp(app: AppKind, role: Role): boolean {
  return APP_ROLES[app].includes(role);
}

/** Rol noto'g'ri ilovada kirganda ko'rsatiladigan matn (null = ruxsat bor). */
export function wrongAppMessage(app: AppKind, role: Role): string | null {
  if (canUseApp(app, role)) return null;
  if (role === 'cashier') return "Kassirlar uchun alohida Kassa ilovasi bor (Windows).";
  return "Ofitsiantlar va menejerlar uchun mobil ilovadan foydalaning.";
}

export const isManager = (u: Pick<User, 'role'> | null | undefined): boolean => u?.role === 'manager';
export const isWaiter = (u: Pick<User, 'role'> | null | undefined): boolean => u?.role === 'waiter';
export const isCashier = (u: Pick<User, 'role'> | null | undefined): boolean => u?.role === 'cashier';

export function fullName(u: Pick<User, 'first_name' | 'last_name'> | null | undefined): string {
  if (!u) return '';
  return [u.first_name, u.last_name].filter(Boolean).join(' ');
}
