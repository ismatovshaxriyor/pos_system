import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { describeError } from './errors';
import type { Pos } from './pos';
import { RESYNC_EVENT, type RealtimeStatus } from './realtime';
import type { SessionState } from './session';
import type { Bootstrap } from './types';

export interface BootstrapCtx {
  data: Bootstrap | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Bu eventlar kelganda `bootstrap` qayta so'raladi. Payload'lar ataylab yengil
 * "qayta so'ra" signali (ayniqsa stol holati so'rovchiga nisbiy, tayyor kelmaydi).
 */
export const DEFAULT_REFRESH_EVENTS: readonly string[] = [
  'table_status_changed',
  'menu_changed',
  'order_updated',
  'price_changed',
  'register_closed',
  'register_opened',
];

/**
 * Mobil (React Native) va kassir (Electron/React DOM) ilovalari uchun bir xil React
 * bog'lamalari. Faqat `react` ga tayanadi - react-native yoki DOM'ga emas.
 * Ilova bir marta `createPosHooks(pos)` chaqiradi va qaytgan hook'larni eksport qiladi.
 */
export function createPosHooks(pos: Pos) {
  function useSession(): SessionState {
    return useSyncExternalStore(pos.session.subscribe, pos.session.getState, pos.session.getState);
  }

  function useRealtimeStatus(): RealtimeStatus {
    const [status, setStatus] = useState<RealtimeStatus>(pos.realtime.getStatus());
    useEffect(() => pos.realtime.onStatus(setStatus), []);
    return status;
  }

  /** Real-time eventlar kelganda `fn` ni (bir nechtasini birlashtirib, `delayMs` kechiktirib) chaqiradi. */
  function useRealtimeRefresh(events: readonly string[], fn: () => void, delayMs = 300): void {
    const key = events.join(',');
    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const trigger = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delayMs);
      };
      const offs = [...key.split(','), RESYNC_EVENT].filter(Boolean).map((e) => pos.realtime.on(e, trigger));
      return () => {
        if (timer) clearTimeout(timer);
        offs.forEach((off) => off());
      };
    }, [fn, delayMs, key]);
  }

  const Ctx = createContext<BootstrapCtx | null>(null);

  function BootstrapProvider({
    children,
    events = DEFAULT_REFRESH_EVENTS,
  }: {
    children: ReactNode;
    events?: readonly string[];
  }) {
    const [data, setData] = useState<Bootstrap | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
      try {
        setData(await pos.api.bootstrap());
        setError(null);
      } catch (e) {
        // Eski ma'lumot qolsin (WiFi uzilganda ham stollar ko'rinaversin), faqat xatoni ko'rsatamiz.
        setError(describeError(e));
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      void refresh();
    }, [refresh]);

    const onEvent = useCallback(() => void refresh(), [refresh]);
    useRealtimeRefresh(events, onEvent);

    const value = useMemo(() => ({ data, loading, error, refresh }), [data, loading, error, refresh]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useBootstrap(): BootstrapCtx {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useBootstrap faqat BootstrapProvider ichida ishlaydi.');
    return ctx;
  }

  return { useSession, useRealtimeStatus, useRealtimeRefresh, BootstrapProvider, useBootstrap };
}

export type PosHooks = ReturnType<typeof createPosHooks>;
