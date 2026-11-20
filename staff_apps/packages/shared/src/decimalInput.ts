/**
 * Foydalanuvchi kiritgan matnni server kutadigan decimal qatoriga aylantiradi.
 * Vergul nuqtaga o'tkaziladi ("1,5" -> "1.5"), bo'shliqlar (mingliklar) olib tashlanadi.
 * Manfiy, harfli yoki `decimals`dan ko'p kasr raqamli kiritma `null` (noto'g'ri) bo'ladi.
 */
export function parseDecimalInput(text: string, decimals = 2): string | null {
  const t = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const frac = t.split('.')[1];
  if (frac && frac.length > decimals) return null;
  return t;
}

/** Maydon bo'sh bo'lsa `fallback`, aks holda `parseDecimalInput` (noto'g'ri bo'lsa `null`). */
export function parseOptionalDecimal(text: string, fallback: string, decimals = 2): string | null {
  return text.trim() === '' ? fallback : parseDecimalInput(text, decimals);
}

/** Ko'rsatish: "12.000" -> "12", "1.500" -> "1.5". */
export function trimDecimal(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? String(n) : '0';
}
