export function num(v: string | number | undefined | null): number {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return isNaN(n) ? 0 : n;
}

export function som(v: string | number | undefined | null): string {
  return Math.round(num(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function clock(iso: string): string {
  try {
    return new Intl.DateTimeFormat('uz', {
      timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}
