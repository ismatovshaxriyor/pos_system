import { useEffect, useState } from 'react';

/** Har `ms` da qayta chizish uchun hozirgi vaqt (buyurtma "necha daqiqa oldin" yorlig'i yangilanib tursin). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
