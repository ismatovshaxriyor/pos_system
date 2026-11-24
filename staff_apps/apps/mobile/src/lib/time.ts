const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Soat:daqiqa, 24 soatlik ("14:15"). `toLocaleTimeString('uz-UZ')` ishlatilmaydi: Android'dagi Hermes `uz`
 * lokalini bilmay inglizchaga o'tib, "2:15 PM" chiqarardi.
 */
export function hhmm(iso: string | number | Date): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
