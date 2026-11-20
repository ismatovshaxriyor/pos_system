import { elapsedLabel, formatMoney, fullName, toTiyin, type Order, type Table, type TableStatus } from '@pos/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useDevices } from '@/lib/devices';
import { useBootstrap, useRealtimeStatus, useSession } from '@/lib/hooks';
import { Avatar, Card, ErrorText, Muted, Pill, Screen, Txt } from '@/ui/kit';
import { Chip } from '@/ui/parts';
import { SettingsSheet } from '@/ui/settings';
import { useHand, useTheme } from '@/ui/theme';
import { pos } from '@/lib/pos';

const ROLE_LABEL = { manager: 'Menejer', waiter: 'Ofitsiant', cashier: 'Kassir' } as const;
const STATUS_LABEL: Record<TableStatus, string> = { free: "Bo'sh", occupied_by_me: 'Mening stolim', occupied: 'Band' };
/** Shundan ko'p kutgan stol sariq belgi bilan ajraladi (kassir ilovasi bilan bir xil chegara). */
const LATE_AFTER_MS = 45 * 60_000;

/** Stollar: bo'sh stolga bosilsa yangi buyurtma, band stolga bosilsa mavjud buyurtma ochiladi. */
export default function TablesScreen() {
  const { user } = useSession();
  const rt = useRealtimeStatus();
  const { c } = useTheme();
  const hand = useHand();
  const { data, loading, error, refresh } = useBootstrap();
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  // Faqat menejerga: tasdiq kutayotgan yangi qurilmalar soni (30 soniyada bir yangilanadi).
  const { pending: pendingDevices } = useDevices(user?.role === 'manager');

  const tables = useMemo(
    () => (data?.tables ?? []).filter((t) => zoneId === null || t.zone?.id === zoneId),
    [data, zoneId],
  );

  function orderOf(t: Table): Order | undefined {
    // Ofitsiantga bootstrap faqat o'z buyurtmalarini beradi; menejer hammasini ko'radi.
    return data?.active_orders.find((o) => o.table?.id === t.id);
  }

  function open(t: Table) {
    if (t.status === 'free') {
      router.push({ pathname: '/order/new', params: { tableId: String(t.id) } });
      return;
    }
    const order = orderOf(t);
    if (order) router.push({ pathname: '/order/[id]', params: { id: String(order.id) } });
  }

  const who = user ? `${fullName(user)} · ${ROLE_LABEL[user.role]}` : '';
  const now = Date.now();

  return (
    <>
      <Screen>
        <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Txt size={14} weight={500} tone="muted">
              {user ? ROLE_LABEL[user.role] : ''} ·{' '}
              <Txt size={14} weight={500} tone={rt === 'open' ? 'ok' : 'muted'}>
                {rt === 'open' ? 'jonli' : 'ulanmoqda...'}
              </Txt>
            </Txt>
            <Txt family="disp" size={38} numberOfLines={1}>
              {fullName(user)}
            </Txt>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sozlamalar"
            onPress={() => setSettings(true)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.grid,
              backgroundColor: c.card,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: c.ink }} />
            ))}
          </Pressable>
        </View>

        {user?.role === 'manager' && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/devices')}>
            <Card edge={pendingDevices.length > 0 ? c.warn : c.edge} style={{ minHeight: 64, justifyContent: 'center', gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={17} weight={600}>
                  Qurilmalar
                </Txt>
                {pendingDevices.length > 0 ? (
                  <Pill label={`${pendingDevices.length} ta tasdiq kutmoqda`} kind="warn" />
                ) : (
                  <Txt size={14} tone="muted">
                    Hammasi joyida
                  </Txt>
                )}
              </View>
            </Card>
          </Pressable>
        )}

        {data && !data.register_open && (
          <View style={{ backgroundColor: c.banner, borderLeftWidth: 5, borderLeftColor: c.warn, borderRadius: 12, padding: 14 }}>
            <Txt size={15} weight={600} style={{ color: c.onBanner }}>
              Kassa yopiq — yangi buyurtma ochib bo'lmaydi.
            </Txt>
          </View>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        {loading && !data && <Muted>Yuklanmoqda...</Muted>}

        {data && data.table_zones.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="Hammasi" active={zoneId === null} onPress={() => setZoneId(null)} />
            {data.table_zones.map((z) => (
              <Chip key={z.id} label={z.name} active={zoneId === z.id} onPress={() => setZoneId(z.id)} />
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tables.map((t) => {
            const blocked = t.status === 'occupied' && user?.role === 'waiter';
            const order = t.status === 'free' ? undefined : orderOf(t);
            const late = !!order && now - Date.parse(order.created_at) >= LATE_AFTER_MS;
            const paid = !!order && toTiyin(order.amount_paid) > 0;
            // Chap chiziq = holat: bo'sh - neytral, men band qilgan - yashil, boshqa band - sariq.
            const edge = t.status === 'free' ? c.edge : t.status === 'occupied_by_me' ? c.ok : c.warn;
            return (
              <Pressable key={t.id} disabled={blocked} onPress={() => open(t)} style={{ width: '48.6%', opacity: blocked ? 0.55 : 1 }}>
                <Card edge={edge} style={{ minHeight: 112, gap: 4 }}>
                  <Txt family="disp" size={34}>
                    {t.name}
                  </Txt>
                  <Txt size={13} tone="muted">
                    {STATUS_LABEL[t.status]}
                    {t.zone ? ` · ${t.zone.name}` : ''} · {t.capacity} o'rin
                  </Txt>
                  {order && (
                    <View style={{ gap: 6, marginTop: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {order.waiter && <Avatar name={order.waiter.first_name} />}
                        <Pill label={elapsedLabel(order.created_at, now)} kind={late ? 'warn' : paid ? 'ok' : 'neutral'} />
                      </View>
                      <Txt family="mono" weight={500} size={16}>
                        {formatMoney(order.balance_due)}
                      </Txt>
                    </View>
                  )}
                </Card>
              </Pressable>
            );
          })}
        </View>
        {data && tables.length === 0 && <Muted>Stol topilmadi.</Muted>}

        <Pressable onPress={() => void refresh()} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={15} weight={500} tone="muted" style={{ textDecorationLine: 'underline' }}>
            Yangilash
          </Txt>
        </Pressable>
      </Screen>

      <SettingsSheet
        visible={settings}
        who={who}
        onClose={() => setSettings(false)}
        onSignOut={() => {
          setSettings(false);
          void pos.session.signOut();
        }}
      />
    </>
  );
}
