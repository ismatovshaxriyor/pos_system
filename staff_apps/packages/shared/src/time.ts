/** "hozir" / "23 daq" / "1 soat 5 daq" / "3 kun 2 soat". Server va klient soati farq qilsa (manfiy) - "hozir". Noto'g'ri sana - bo'sh qator. */
export function elapsedLabel(isoOrDate: string | Date, nowMs: number = Date.now()): string {
  const t = typeof isoOrDate === 'string' ? Date.parse(isoOrDate) : isoOrDate.getTime();
  if (Number.isNaN(t)) return '';
  const minutes = Math.floor((nowMs - t) / 60_000);
  if (minutes < 1) return 'hozir';
  if (minutes < 60) return `${minutes} daq`;
  const h = Math.floor(minutes / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rest = h % 24;
    return rest === 0 ? `${d} kun` : `${d} kun ${rest} soat`;
  }
  const m = minutes % 60;
  return m === 0 ? `${h} soat` : `${h} soat ${m} daq`;
}

/** Daqiqalarni "2 soat 5 daq" / "45 daq" / "0 daq" ko'rinishiga. Manfiy/NaN - "0 daq". */
export function durationLabel(totalMinutes: number): string {
  const m = Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.floor(totalMinutes) : 0;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} daq`;
  return r === 0 ? `${h} soat` : `${h} soat ${r} daq`;
}
