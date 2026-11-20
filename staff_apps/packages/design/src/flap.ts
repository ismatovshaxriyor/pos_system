export interface FlapCell {
  /** Ko'rsatiladigan belgi; `gap` bo'lsa bo'sh. */
  ch: string;
  /** Minglar orasidagi bo'shliq (katak chizilmaydi). */
  gap: boolean;
}

/**
 * Split-flap ("aylanuvchi taxta") ko'rinishi uchun summani kataklarga bo'ladi: "92 000" → 9, 2, (gap), 0, 0, 0.
 * Har qanday bo'shliq (shu jumladan qattiq/NBSP, `formatMoney` shuni ishlatadi) gap bo'ladi.
 */
export function flapCells(text: string): FlapCell[] {
  return Array.from(text.trim()).map((ch) => (/\s/.test(ch) ? { ch: '', gap: true } : { ch, gap: false }));
}
