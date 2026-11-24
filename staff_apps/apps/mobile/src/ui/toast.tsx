import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt, useLift } from './kit';
import { useTheme } from './theme';

type Kind = 'error' | 'ok';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

interface ToastApi {
  show: (text: string, kind?: Kind) => void;
}

const Ctx = createContext<ToastApi>({ show: () => undefined });

/** Xato muddati uzunroq (o'qib ulgursin), muvaffaqiyat qisqa. */
const DURATION: Record<Kind, number> = { error: 5500, ok: 2800 };

/**
 * Ekran tepasida suzib turadigan xabar. Sahifa qancha pastga aylantirilgan bo'lmasin, aynan ko'rinib
 * turgan ekranning tepasida chiqadi (safe-area ichida). Bosilsa yopiladi.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const seq = useRef(0);
  const show = useCallback((text: string, kind: Kind = 'ok') => {
    if (!text) return;
    seq.current += 1;
    setToast({ id: seq.current, kind, text });
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {toast && <ToastView key={toast.id} toast={toast} onDone={() => setToast((t) => (t?.id === toast.id ? null : t))} />}
    </Ctx.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const { c, appearance } = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useLift();
  const anim = useRef(new Animated.Value(appearance.reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (!appearance.reduceMotion) Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      if (appearance.reduceMotion) return onDone();
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onDone());
    }, DURATION[toast.kind]);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edge = toast.kind === 'error' ? c.signal : c.ok;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 8, paddingHorizontal: 16, alignItems: 'center', zIndex: 1000, elevation: 20 }}>
      <Animated.View
        style={{
          width: '100%',
          maxWidth: 560,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        }}
      >
        <Pressable
          accessibilityRole="alert"
          onPress={onDone}
          style={[
            {
              backgroundColor: c.card,
              borderColor: c.grid,
              borderWidth: 1,
              borderLeftWidth: 6,
              borderLeftColor: edge,
              borderRadius: 16,
              paddingVertical: 12,
              paddingHorizontal: 16,
              elevation: 8,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
            },
            lift,
          ]}
        >
          <Txt size={15} weight={500} tone={toast.kind === 'error' ? 'signal' : 'ink'}>
            {toast.text}
          </Txt>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastApi {
  return useContext(Ctx);
}

/**
 * Sahifa holatidagi `error`/`info` o'zgarganda toast chiqaradi. `muteError` - xato boshqa joyda
 * (masalan ochiq forma oynasi ichida) ko'rsatilayotganda takrorlamaslik uchun.
 */
export function useNotify(error: string | null, info: string | null, muteError = false) {
  const { show } = useToast();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!error) {
      handled.current = null;
      return;
    }
    if (handled.current === error) return;
    handled.current = error; // oyna ichida ko'rsatilgan xato oyna yopilgach toast bo'lib qaytmasin
    if (!muteError) show(error, 'error');
  }, [error, muteError, show]);
  useEffect(() => {
    if (info) show(info, 'ok');
  }, [info, show]);
}
