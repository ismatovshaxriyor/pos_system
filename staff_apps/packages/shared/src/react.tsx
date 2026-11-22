import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { FoundServer } from './discovery';
import { describeError } from './errors';
import type { Pos } from './pos';
import { RESYNC_EVENT, type RealtimeStatus } from './realtime';
import { recoverServer, ServerWatcher } from './recovery';
import type { SessionState } from './session';
import type { Bootstrap } from './types';
import { isWaiterCallForUser, mergeWaiterCall, type CallWaiterData, type WaiterCall } from './waiterCall';

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

  /**
   * Mijoz chaqiruvlari navbati (`call_waiter`): faqat shu foydalanuvchiga tegishlilari
   * (`isWaiterCallForUser`). `onNew` har yangi chaqiruvda - tebranish/ovoz uchun.
   * Server chaqiruvlarni qayta yubormaydi: ilova yopiq/uzilgan paytdagisi kelmaydi.
   */
  function useWaiterCalls(onNew?: (call: CallWaiterData) => void): { calls: WaiterCall[]; dismiss: (tableId: number) => void } {
    const userId = useSession().user?.id ?? null;
    const [calls, setCalls] = useState<WaiterCall[]>([]);
    const onNewRef = useRef(onNew);
    onNewRef.current = onNew;

    useEffect(() => {
      setCalls([]);
      if (userId === null) return;
      return pos.realtime.on('call_waiter', (ev) => {
        const data = ev.data as unknown as CallWaiterData;
        if (typeof data?.table_id !== 'number' || !isWaiterCallForUser(data, userId)) return;
        setCalls((prev) => mergeWaiterCall(prev, data));
        onNewRef.current?.(data);
      });
    }, [userId]);

    const dismiss = useCallback((tableId: number) => setCalls((prev) => prev.filter((c) => c.tableId !== tableId)), []);
    return { calls, dismiss };
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

  /**
   * Server IP'si o'zgarsa (tarmoq almashdi) manzilni o'zi yangilaydi: saqlangan restoran ID'si bo'yicha
   * `find` (platformaga xos qidiruv) orqali qayta topadi, sessiya saqlanadi, real-time qayta ulanadi.
   * Ilova ildizida bir marta chaqiriladi.
   */
  function useServerRecovery(find: (signal: AbortSignal) => Promise<FoundServer[]>): void {
    const hasServer = useSession().serverUrl !== null;
    const findRef = useRef(find);
    findRef.current = find;

    useEffect(() => {
      if (!hasServer) return;
      const ctrl = new AbortController();
      const watcher = new ServerWatcher({
        check: () =>
          recoverServer({
            getUrl: pos.session.getBaseUrl,
            getRestaurantId: pos.session.getRestaurantId,
            adopt: (url, id) => pos.session.setServerUrl(url, id),
            find: (signal) => findRef.current(signal),
            signal: ctrl.signal,
          }),
        // Yangi manzilga darrov ulanish (aks holda eski taymer tugashini kutardi).
        onMoved: () => {
          if (pos.session.getState().status !== 'signed_in') return;
          pos.realtime.stop();
          pos.realtime.start();
        },
      });
      watcher.start();
      const off = pos.realtime.onStatus((st) => {
        if (st === 'reconnecting') watcher.nudge();
      });
      return () => {
        ctrl.abort();
        watcher.stop();
        off();
      };
    }, [hasServer]);
  }

  return { useSession, useRealtimeStatus, useRealtimeRefresh, useWaiterCalls, useServerRecovery, BootstrapProvider, useBootstrap };
}

export type PosHooks = ReturnType<typeof createPosHooks>;
