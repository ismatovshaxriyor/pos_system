import { elapsedLabel, formatMoney, fullName, toTiyin, type Order, type Table, type TableStatus } from '@pos/shared';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { useDevices } from '@/lib/devices';
import { useBootstrap, useRealtimeStatus, useSession } from '@/lib/hooks';
import { Avatar, Card, ErrorText, Field, Muted, Pill, Press, Screen, Txt } from '@/ui/kit';
import { Chip } from '@/ui/parts';
import { SettingsSheet } from '@/ui/settings';
import { ShiftCard } from '@/ui/shift';
import { useHand, useTheme } from '@/ui/theme';
import { pos } from '@/lib/pos';

const ROLE_LABEL = { manager: 'Menejer', waiter: 'Ofitsiant', cashier: 'Kassir' } as const;
const STATUS_LABEL: Record<TableStatus, string> = { free: "Bo'sh", occupied_by_me: 'Mening', occupied: 'Band' };
/** Menejer yorliqlari: 2x2 ixcham to'r (ilgari 4 ta katta kartochka stollarni ~880px pastga surardi). */
const MANAGER_LINKS: { href: Href; title: string }[] = [
  { href: '/manage', title: 'Boshqaruv' },
  { href: '/reports', title: 'Hisobotlar' },
  { href: '/attendance', title: 'Davomat' },
  { href: '/devices', title: 'Qurilmalar' },
];
/** Shundan ko'p kutgan stol sariq belgi bilan ajraladi (kassir ilovasi bilan bir xil chegara). */
const LATE_AFTER_MS = 45 * 60_000;

/** Stollar: bo'sh stolga bosilsa yangi buyurtma, band stolga bosilsa mavjud buyurtma ochiladi. */
export default function TablesScreen() {
  const { user } = useSession();
  const rt = useRealtimeStatus();
  const { c, appearance } = useTheme();
  const hand = useHand();
  const { width } = useWindowDimensions();
  // Ko'proq stol sig'sin: telefonda 3 ustun, planshetda 4.
  const cols = appearance.tableCols === 'auto' ? (width >= 600 ? 4 : 3) : Number(appearance.tableCols);
  const { data, loading, error, refresh } = useBootstrap();
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [tableQuery, setTableQuery] = useState('');
  const [settings, setSettings] = useState(false);
  // Faqat menejerga: tasdiq kutayotgan yangi qurilmalar soni (30 soniyada bir yangilanadi).
  const { pending: pendingDevices } = useDevices(user?.role === 'manager');

  const tables = useMemo(
    () => {
      const q = tableQuery.trim().toLowerCase();
      return (data?.tables ?? []).filter((t) => (zoneId === null || t.zone?.id === zoneId) && (!q || t.name.toLowerCase().includes(q)));
    },
    [data, zoneId, tableQuery],
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

  const cellBasis = cols === 4 ? '22%' : cols === 3 ? '30%' : '46%';
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
          <Press
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
          </Press>
        </View>

        <ShiftCard />

        {user?.role === 'manager' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {MANAGER_LINKS.map((l) => {
              const isDevices = l.title === 'Qurilmalar';
              const waiting = isDevices ? pendingDevices.length : 0;
              return (
                <Press key={l.title} accessibilityRole="button" onPress={() => router.push(l.href)} style={{ flexBasis: '47%', flexGrow: 1 }}>
                  <Card edge={waiting > 0 ? c.warn : undefined} style={{ minHeight: 56, padding: 12, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Txt size={16} weight={600}>
                        {l.title}
                      </Txt>
                      {waiting > 0 && <Pill label={String(waiting)} kind="warn" />}
                    </View>
                  </Card>
                </Press>
              );
            })}
          </View>
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

        {data && data.tables.length > 9 && (
          <Field label="Stol qidirish" value={tableQuery} onChangeText={setTableQuery} placeholder="Stol nomi" />
        )}

        {data && data.table_zones.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="Hammasi" active={zoneId === null} onPress={() => setZoneId(null)} />
            {data.table_zones.map((z) => (
              <Chip key={z.id} label={z.name} active={zoneId === z.id} onPress={() => setZoneId(z.id)} />
            ))}
          </View>
        )}

        {data && tables.length === 0 && tableQuery.trim() !== '' && <Muted>Stol topilmadi.</Muted>}

        {/* key: ustunlar soni o'zgarganda Android'da flexBasis foizi jonli qayta hisoblanmasdi, shuning uchun ro'yxat qayta yaratiladi. */}
        <View key={`cols${cols}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tables.map((t) => {
            const blocked = t.status === 'occupied' && user?.role === 'waiter';
            const order = t.status === 'free' ? undefined : orderOf(t);
            const late = !!order && now - Date.parse(order.created_at) >= LATE_AFTER_MS;
            const paid = !!order && toTiyin(order.amount_paid) > 0;
            // Chap chiziq = holat: bo'sh - neytral, men band qilgan - yashil, boshqa band - sariq.
            const edge = t.status === 'free' ? c.edge : t.status === 'occupied_by_me' ? c.ok : c.warn;
            return (
              <Press key={t.id} disabled={blocked} onPress={() => open(t)} style={{ flexBasis: cellBasis, flexGrow: 1, opacity: blocked ? 0.55 : 1 }}>
                <Card edge={edge} style={{ minHeight: 96, padding: 10, gap: 2 }}>
                  <Txt family="disp" size={28} numberOfLines={1}>
                    {t.name}
                  </Txt>
                  <Txt size={12} tone="muted" numberOfLines={1}>
                    {STATUS_LABEL[t.status]} · {t.capacity} o'rin
                  </Txt>
                  {order && (
                    <View style={{ gap: 4, marginTop: 2 }}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                        {order.waiter && <Avatar name={order.waiter.first_name} />}
                        <Pill label={elapsedLabel(order.created_at, now)} kind={late ? 'warn' : paid ? 'ok' : 'neutral'} />
                      </View>
                      <Txt family="mono" weight={500} size={14} numberOfLines={1} fit>
                        {formatMoney(order.balance_due)}
                      </Txt>
                    </View>
                  )}
                </Card>
              </Press>
            );
          })}
          {/* Oxirgi qator to'lmasa, kartalar butun qatorga cho'zilib ketmasin. Foiz+gap kichik ekranda ustunni tushirib yuborardi, shuning uchun basis chegaradan kichik. */}
          {Array.from({ length: (cols - (tables.length % cols)) % cols }, (_, i) => (
            <View key={`pad${i}`} style={{ flexBasis: cellBasis, flexGrow: 1 }} />
          ))}
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
