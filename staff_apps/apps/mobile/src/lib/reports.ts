import { describeError, formatMoney, rangeLabel, type DashboardReport, type DateRange, type SalesReport } from '@pos/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ReportState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hisobotni yuklaydi. `deps` (davr, bo'lim) o'zgarganda eski ma'lumot tozalanadi - sarlavhadagi davr bilan
 * raqamlar mos kelmay qolmasin. `pollMs` berilsa jimgina (yuklanish belgisisiz) yangilab turadi ("bugun" jonli ko'rinishi).
 * Kechikib kelgan eski javob yangisini bosib ketmaydi (`seq`).
 */
export function useReport<T>(load: () => Promise<T>, deps: readonly unknown[], pollMs?: number): ReportState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const run = useCallback(async (silent: boolean) => {
    const n = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const result = await loadRef.current();
      if (n !== seq.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (n === seq.current) setError(describeError(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    void run(false);
    if (!pollMs) return () => void seq.current++;
    const t = setInterval(() => void run(true), pollMs);
    return () => {
      clearInterval(t);
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, pollMs, ...deps]);

  const refresh = useCallback(() => run(false), [run]);
  return { data, error, loading, refresh };
}

/** Oldingi davr ma'lumoti taqqoslash uchun ixtiyoriy: yuklanmasa asosiy hisobot baribir ko'rinadi. */
export async function withPrevious<T>(current: Promise<T>, previous: Promise<T>): Promise<{ cur: T; prev: T | null }> {
  const [cur, prev] = await Promise.all([current, previous.catch(() => null)]);
  return { cur, prev };
}

/** "Ulashish" (Telegram/SMS): menejer egasiga bir bosishda yuboradigan qisqa matn. */
export function dashboardText(d: DashboardReport, restaurant?: string): string {
  const r = d.revenue;
  const lines = [
    `${restaurant ? `${restaurant} · ` : ''}Kunlik hisobot ${d.date}`,
    `Tushum: ${formatMoney(r.total)}`,
    `  Naqd ${formatMoney(r.by_method.cash)} · Karta ${formatMoney(r.by_method.card)} · Boshqa ${formatMoney(r.by_method.other)}`,
    `Buyurtmalar: ${r.order_count} · O'rtacha chek ${formatMoney(r.avg_check)}`,
  ];
  if (Number(r.discount_total) > 0) lines.push(`Chegirmalar: ${formatMoney(r.discount_total)}`);
  if (r.cancelled_orders > 0) lines.push(`Bekor qilingan buyurtmalar: ${r.cancelled_orders}`);
  if (d.top_products.length > 0) {
    lines.push('Top taomlar:');
    d.top_products.slice(0, 5).forEach((p, i) => lines.push(`  ${i + 1}. ${p.name} — ${p.quantity} ta`));
  }
  lines.push(`Qarzdorlik: ${formatMoney(d.debts.total_outstanding)} (${d.debts.debtor_count} kishi)`);
  return lines.join('\n');
}

export function salesText(s: SalesReport, range: DateRange, restaurant?: string): string {
  return [
    `${restaurant ? `${restaurant} · ` : ''}Sotuv hisoboti ${rangeLabel(range)}`,
    `Tushum: ${formatMoney(s.total_revenue)}`,
    `Buyurtmalar: ${s.order_count} · O'rtacha chek ${formatMoney(s.avg_check)}`,
    `Naqd ${formatMoney(s.by_method.cash)} · Karta ${formatMoney(s.by_method.card)} · Boshqa ${formatMoney(s.by_method.other)}`,
    ...(Number(s.discount_total) > 0 ? [`Chegirmalar: ${formatMoney(s.discount_total)}`] : []),
  ].join('\n');
}
