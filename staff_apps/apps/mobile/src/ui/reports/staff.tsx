import { barRatios, formatMoney, staffWorkbook, tiyinToDecimal, toTiyin, type DateRange } from '@pos/shared';
import { View } from 'react-native';

import { pos } from '@/lib/pos';
import { useReport } from '@/lib/reports';

import { Txt } from '../kit';
import { HBar } from '../charts';
import { Pill } from '../kit';
import { Block, Row, Status } from './common';
import { ExcelButton } from './excel';

const ROLE_LABEL: Record<string, string> = { manager: 'Menejer', waiter: 'Ofitsiant', cashier: 'Kassir' };

function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Xodimlar: har ofitsiant tushumi, yopgan buyurtmalari, o'rtacha cheki + hozir ishdagilar. */
export function StaffSection({ range, onRefreshRef }: { range: DateRange; onRefreshRef: (fn: () => Promise<void>) => void }) {
  const { data, error, loading, refresh } = useReport(() => pos.api.reports.staff(range), [range.from, range.to]);
  onRefreshRef(refresh);
  const ratios = barRatios((data?.waiters ?? []).map((w) => w.revenue));

  return (
    <>
      <Status loading={loading} error={error} ready={!!data} />
      {data && (
        <>
          <Block title="Ofitsiantlar bo'yicha tushum">
            {data.waiters.length === 0 && <Txt tone="muted">Bu davrda to'lov yo'q.</Txt>}
            {data.waiters.map((w, i) => {
              const avg = w.completed_orders > 0 ? tiyinToDecimal(Math.round(toTiyin(w.revenue) / w.completed_orders)) : null;
              return (
                <Row
                  key={`${w.waiter_id}-${i}`}
                  left={w.waiter_name}
                  sub={`${w.completed_orders} ta buyurtma${avg ? ` · o'rtacha ${formatMoney(avg)}` : ''}`}
                  right={formatMoney(w.revenue)}
                  bar={<HBar ratio={ratios[i] ?? 0} strong={i === 0} />}
                />
              );
            })}
          </Block>

          <Block title="Hozir ishda" right={<Pill label={`${data.clocked_in.length} kishi`} />}>
            {data.clocked_in.length === 0 && <Txt tone="muted">Hech kim kelganini belgilamagan.</Txt>}
            {data.clocked_in.map((p) => (
              <View key={p.user_id}>
                <Row left={p.name || '—'} sub={ROLE_LABEL[p.role] ?? p.role} right={`${clock(p.check_in)} dan`} />
              </View>
            ))}
          </Block>

          <ExcelButton build={async () => staffWorkbook(range, data)} />
        </>
      )}
    </>
  );
}
