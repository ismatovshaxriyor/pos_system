/**
 * Backend `User.username` - `+998xxxxxxxxx`. Xodimlar raqamni turlicha yozadi
 * ("90 123 45 67", "998901234567", "+998 (90) 123-45-67"), shuning uchun
 * yuborishdan oldin yagona ko'rinishga keltiramiz. Yaroqsiz bo'lsa `null`.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return null;
}

/** Terish paytida ko'rsatish uchun: `+998 90 123 45 67`. Tugallanmagan raqamni ham qabul qiladi. */
export function formatPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return ['+998', ...parts].join(' ');
}
