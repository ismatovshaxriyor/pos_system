/**
 * UUID v4. `Order.sync_uuid` klient tomonda yaratiladi (offline-first
 * idempotentlik: qayta urinishda dublikat buyurtma ochilmaydi), shuning uchun
 * bu yerda kuchsiz tasodifiy manba jim ishlatilmasligi kerak.
 * Tartib: `crypto.randomUUID` → `crypto.getRandomValues` → Math.random (oxirgi chora).
 * React Native'da `crypto` yo'q bo'lishi mumkin - `expo-crypto` polyfill'ini
 * mobil ilova `index` faylida ulang.
 */
export function uuidv4(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
