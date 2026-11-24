import { describeError, elapsedLabel, fullName, type StaffDevice } from '@pos/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useDevices } from '@/lib/devices';
import { useSession } from '@/lib/hooks';
import { pos } from '@/lib/pos';
import { Button, Card, ErrorText, Eyebrow, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { useNotify } from '@/ui/toast';
import { useHand, useTheme } from '@/ui/theme';

/**
 * Menejer: yangi ofitsiant qurilmalarini tasdiqlash va faol qurilmalarni chetlatish.
 * Ofitsiant yangi telefondan birinchi marta kirganda "tasdiq kutilmoqda" holatida qoladi -
 * shu yerda tasdiqlansa, keyingi kirishda o'tadi.
 */
export default function DevicesScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const { pending, active, loaded, error, refresh } = useDevices(isManager, 10_000);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useNotify(actionError, null);
  const { c } = useTheme();
  const hand = useHand();

  async function run(id: number, fn: () => Promise<unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRevoke(d: StaffDevice) {
    Alert.alert(
      'Qurilmani chetlatish',
      `${fullName(d.user)} (${d.device_label || 'qurilma'}) tizimdan chiqariladi va qayta kirsa yana tasdiq so'raladi.`,
      [
        { text: "Yo'q", style: 'cancel' },
        { text: 'Chetlatish', style: 'destructive', onPress: () => void run(d.id, () => pos.api.devices.revoke(d.id)) },
      ],
    );
  }

  const label = (d: StaffDevice) => d.device_label || d.device_id.slice(0, 8);

  return (
    <Screen>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Xodimlar</Eyebrow>
          <Title size={48}>Qurilmalar</Title>
        </View>
        <Button title="← Stollar" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      {isManager && !loaded && !error && <Muted>Yuklanmoqda...</Muted>}

      {isManager && loaded && (
        <>
          <Txt size={14} weight={500} tone="muted">
            Tasdiq kutayotganlar
          </Txt>
          {pending.length === 0 && <Muted>Yangi so'rov yo'q.</Muted>}
          {pending.map((d) => (
            <Card key={d.id} edge={c.warn}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={19} weight={600} style={{ flex: 1 }}>
                  {fullName(d.user)}
                </Txt>
                <Pill label={elapsedLabel(d.created_at, Date.now())} kind="warn" />
              </View>
              <Muted>
                {label(d)} · {d.user.username}
              </Muted>
              <Button title="Tasdiqlash" loading={busyId === d.id} onPress={() => void run(d.id, () => pos.api.devices.approve(d.id))} />
              <Button title="Rad etish" variant="danger" disabled={busyId === d.id} onPress={() => confirmRevoke(d)} />
            </Card>
          ))}

          <Txt size={14} weight={500} tone="muted" style={{ marginTop: 6 }}>
            Faol qurilmalar
          </Txt>
          {active.length === 0 && <Muted>Faol qurilma yo'q.</Muted>}
          {active.map((d) => (
            <Card key={d.id} edge={c.ok}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={17} weight={600} style={{ flex: 1 }}>
                  {fullName(d.user)}
                </Txt>
                <Pill label={d.user.role === 'cashier' ? 'Kassir' : d.user.role === 'manager' ? 'Menejer' : 'Ofitsiant'} />
              </View>
              <Muted>
                {label(d)} · {d.last_login_at ? `oxirgi kirish ${elapsedLabel(d.last_login_at, Date.now())} oldin` : 'hali kirmagan'}
              </Muted>
              <Button title="Chetlatish" variant="danger" compact disabled={busyId === d.id} onPress={() => confirmRevoke(d)} />
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
