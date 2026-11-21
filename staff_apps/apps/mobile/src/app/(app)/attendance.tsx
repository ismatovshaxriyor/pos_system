import { describeError, durationLabel, elapsedLabel, fullName, type AttendanceRecord, type AttendanceSummary } from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { pos } from '@/lib/pos';
import { Button, Card, ErrorText, Eyebrow, Muted, Pill, Screen, Segmented, Title, Txt } from '@/ui/kit';
import { useHand, useTheme } from '@/ui/theme';

type Period = 'today' | 'week' | 'month';
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ROLE = { manager: 'Menejer', waiter: 'Ofitsiant', cashier: 'Kassir' } as const;

function range(p: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (p === 'today' ? 0 : p === 'week' ? 6 : 29));
  return { from: ymd(from), to: ymd(to) };
}

/** Menejer: hozir kim ishda va davr bo'yicha ish soatlari (kim qancha ishladi). */
export default function AttendanceScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const { c } = useTheme();
  const hand = useHand();
  const [period, setPeriod] = useState<Period>('today');
  const [onShift, setOnShift] = useState<AttendanceRecord[] | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current; // kechikib kelgan eski davr javobi yangisini bosib ketmasin
    try {
      const [rows, sum] = await Promise.all([pos.api.attendance.onShift(), pos.api.attendance.summary(range(period))]);
      if (mine !== seq.current) return;
      setOnShift(rows);
      setSummary(sum);
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError(describeError(e));
    }
  }, [period]);

  useEffect(() => {
    if (!isManager) return;
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [isManager, load]);

  const total = summary?.staff.reduce((s, r) => s + r.minutes, 0) ?? 0;

  return (
    <Screen onRefresh={() => void load()}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Xodimlar</Eyebrow>
          <Title size={48}>Davomat</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}

      {isManager && (
        <>
          <Txt size={14} weight={500} tone="muted">
            Hozir smenada {onShift ? `(${onShift.length})` : ''}
          </Txt>
          {onShift && onShift.length === 0 && <Muted>Hozir hech kim smenada emas.</Muted>}
          {onShift?.map((a) => (
            <Card key={a.id} edge={c.ok}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={17} weight={600} style={{ flex: 1 }}>
                  {fullName(a.user)}
                </Txt>
                <Pill label={ROLE[a.user.role]} />
              </View>
              <Muted>
                {new Date(a.check_in).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} dan beri ·{' '}
                {elapsedLabel(a.check_in, Date.now())}
              </Muted>
            </Card>
          ))}

          <Txt size={14} weight={500} tone="muted" style={{ marginTop: 6 }}>
            Ish soatlari
          </Txt>
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'today', label: 'Bugun' },
              { value: 'week', label: '7 kun' },
              { value: 'month', label: '30 kun' },
            ]}
          />
          {summary && summary.staff.length === 0 && <Muted>Bu davrda smena yozuvi yo'q.</Muted>}
          {summary?.staff.map((r) => (
            <Card key={r.user.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={17} weight={600} style={{ flex: 1 }}>
                  {fullName(r.user)}
                </Txt>
                {r.on_shift && <Pill label="Ishda" kind="ok" />}
              </View>
              <Txt family="mono" weight={500} size={18}>
                {durationLabel(r.minutes)}
              </Txt>
              <Muted>
                {r.days} kun · {r.shifts} smena
              </Muted>
            </Card>
          ))}
          {summary && summary.staff.length > 0 && <Muted>Jami: {durationLabel(total)}</Muted>}
        </>
      )}
    </Screen>
  );
}
