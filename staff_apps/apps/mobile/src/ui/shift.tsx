import { durationLabel } from '@pos/shared';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useShift } from '@/lib/shift';
import { Button, Card, ErrorText, Pill, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/** Bosh ekrandagi "Smena" kartasi: kelganini/ketganini belgilash (GPS bilan, restoran radiusi ichida). */
export function ShiftCard() {
  const { c } = useTheme();
  const { status, error, busy, toggle } = useShift();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!status && !error) return null;
  const on = status?.on_shift ?? false;
  const since = status?.attendance ? Date.parse(status.attendance.check_in) : NaN;
  const minutes = Number.isNaN(since) ? 0 : Math.max(0, Math.floor((now - since) / 60_000));
  const sinceTime = Number.isNaN(since) ? '' : new Date(since).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <Card edge={on ? c.ok : c.edge} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={17} weight={600}>
            {on ? 'Smenadasiz' : 'Smena boshlanmagan'}
          </Txt>
          <Txt size={14} tone="muted">
            {on ? `${sinceTime} dan beri · ${durationLabel(minutes)}` : 'Ishni boshlashda belgilang'}
          </Txt>
        </View>
        <Pill label={on ? 'Ishda' : 'Ishda emas'} kind={on ? 'ok' : 'neutral'} />
      </View>
      <Button
        title={on ? 'Smenani tugatish' : 'Smenani boshlash'}
        variant={on ? 'ghost' : 'primary'}
        compact
        loading={busy}
        onPress={() => void toggle()}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
