import type { StaffDevice } from './types';

/** Menejer tasdig'ini kutayotgan qurilma: faol, lekin hali tasdiqlanmagan. */
export function isPendingDevice(d: StaffDevice): boolean {
  return d.is_active && !d.is_approved;
}

/** Tasdiqlangan va hozir faol (kira oladigan) qurilma. */
export function isActiveDevice(d: StaffDevice): boolean {
  return d.is_active && d.is_approved;
}

/** Ekran uchun guruhlash: kutayotganlar eng yangisi tepada, faollar oxirgi kirish bo'yicha; chetlatilganlar ko'rsatilmaydi. */
export function groupDevices(devices: readonly StaffDevice[]): { pending: StaffDevice[]; active: StaffDevice[] } {
  const byNewest = (a: StaffDevice, b: StaffDevice) => Date.parse(b.created_at) - Date.parse(a.created_at);
  const byLogin = (a: StaffDevice, b: StaffDevice) =>
    Date.parse(b.last_login_at ?? b.created_at) - Date.parse(a.last_login_at ?? a.created_at);
  return {
    pending: devices.filter(isPendingDevice).sort(byNewest),
    active: devices.filter(isActiveDevice).sort(byLogin),
  };
}
