import { describeError, groupDevices, type StaffDevice } from '@pos/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pos } from './pos';

/**
 * Menejer uchun qurilmalar ro'yxati. Backend yangi qurilma so'rovi uchun faqat `Notification`
 * yaratadi (WS event yo'q), shuning uchun `pollMs` oraliqda qayta so'raymiz.
 * `enabled=false` (ofitsiant) bo'lsa hech narsa so'ralmaydi - bu endpoint faqat menejerga ochiq.
 */
export function useDevices(enabled: boolean, pollMs = 30_000) {
  const [devices, setDevices] = useState<StaffDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const page = await pos.api.devices.list();
      if (alive.current) {
        setDevices(page.results);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(describeError(e));
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    if (!enabled) return () => void (alive.current = false);
    const id = setInterval(() => void refresh(), pollMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [enabled, pollMs, refresh]);

  const grouped = groupDevices(devices ?? []);
  return { ...grouped, loaded: devices !== null, error, refresh };
}
