/**
 * Litsenziya kalitini kiritish paytida formatlaydi: `4d3hbak67ddr` -> `4D3H-BAK6-7DDR`.
 * Yangi kalitlar `XXXX-XXXX-XXXX` (12 belgi, 0/O/1/I siz). Eski kalitlar uzun (40 belgi hex) - ular
 * tegilmaydi, faqat bo'sh joylar olib tashlanadi (Ona registrga e'tibor bermaydi).
 */
export function formatLicenseKey(input: string): string {
  const cleaned = input.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length > 12) return input.replace(/\s+/g, '');
  return (cleaned.toUpperCase().match(/.{1,4}/g) ?? []).join('-');
}

/** Yuborishga tayyormi: yangi format to'liq (12 belgi) yoki eski uzun kalit. */
export function isCompleteLicenseKey(input: string): boolean {
  const cleaned = input.replace(/[^A-Za-z0-9]/g, '');
  return cleaned.length >= 12;
}
