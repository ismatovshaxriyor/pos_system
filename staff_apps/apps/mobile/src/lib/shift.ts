import { describeError, type ShiftStatus } from '@pos/shared';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pos } from './pos';

/** Joriy joylashuvni oladi; ruxsat yo'q/GPS o'chiq bo'lsa tushunarli xabar bilan xato tashlaydi. */
export async function getCoords(): Promise<{ latitude: number; longitude: number }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error("Joylashuvga ruxsat berilmadi. Telefon sozlamalaridan ilovaga joylashuv ruxsatini bering.");
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: p.coords.latitude, longitude: p.coords.longitude };
  } catch {
    throw new Error("Joylashuvni aniqlab bo'lmadi. GPS yoqilganini tekshiring.");
  }
}

/**
 * Joriy xodimning smena holati va "boshlash/tugatish" amallari. Holat `pollMs` da qayta o'qiladi:
 * kassa yopilganda server hammaning smenasini o'zi yopadi - ilova shuni ham ko'rsin.
 */
export function useShift(pollMs = 30_000) {
  const [status, setStatus] = useState<ShiftStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  /** `keepError` - amal xatosi ko'rinib tursin (faqat holat yangilanadi). */
  const refresh = useCallback(async (keepError = false) => {
    try {
      const s = await pos.api.attendance.me();
      if (alive.current) {
        setStatus(s);
        if (!keepError) setError(null);
      }
    } catch (e) {
      if (alive.current) setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [pollMs, refresh]);

  /** Smenani boshlaydi (`status.on_shift=false` bo'lsa) yoki tugatadi. */
  const toggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const where = await getCoords();
      if (status?.on_shift) await pos.api.attendance.checkOut(where);
      else await pos.api.attendance.checkIn(where);
      await refresh();
    } catch (e) {
      setError(e instanceof Error && !('status' in e) ? e.message : describeError(e));
      // Holat eskirgan bo'lishi mumkin (masalan kassa yopilib smena server tomonidan tugagan) - kartani yangilaymiz.
      void refresh(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [refresh, status?.on_shift]);

  return { status, error, busy, toggle, refresh };
}
