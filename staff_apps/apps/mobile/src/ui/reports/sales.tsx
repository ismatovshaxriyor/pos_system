import {
  barRatios,
  dayLabelWithWeekday,
  formatMoney,
  methodShares,
  previousRange,
  type DateRange,
  type SalesGroupBy,
  type SalesRow,
} from '@pos/shared';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { pos } from '@/lib/pos';
import { salesText, useReport, withPrevious } from '@/lib/reports';

import { Button, Txt } from '../kit';
import { Dot, HBar, StackBar } from '../charts';
import { Chip } from '../parts';
import { Block, Delta, Hero, KpiGrid, Row, ShowMore, Status } from './common';

const GROUPS: { id: SalesGroupBy; label: string }[] = [
  { id: 'day', label: 'Kunlar' },
  { id: 'waiter', label: 'Ofitsiantlar' },
  { id: 'product', label: 'Taomlar' },
  { id: 'category', label: 'Toifalar' },
];
const SHADES = { cash: 'ink', card: 'ink60', other: 'edge' } as const;
const METHOD_LABEL = { cash: 'Naqd', card: 'Karta', other: 'Boshqa' } as const;
const COLLAPSED = 8;

function rowLabel(group: SalesGroupBy, r: SalesRow): string {
  return group === 'day' ? dayLabelWithWeekday(r.key) : r.key;
}
function rowSub(group: SalesGroupBy, r: SalesRow): string | undefined {
  if (group === 'product' || group === 'category') return r.quantity !== undefined ? `${r.quantity} ta` : undefined;
  if (group === 'day') return r.payment_count !== undefined ? `${r.payment_count} ta to'lov` : undefined;
  return undefined;
}

/** Sotuv tahlili: davr KPI'lari + oldingi davr bilan taqqoslash + kunlar/ofitsiantlar/taomlar/toifalar kesimi. */
export function SalesSection({
  range,
  restaurant,
  onRefreshRef,
}: {
  range: DateRange;
  restaurant?: string;
  onRefreshRef: (fn: () => Promise<void>) => void;
}) {
  const [group, setGroup] = useState<SalesGroupBy>('day');
  const [expanded, setExpanded] = useState(false);
  const { data, error, loading, refresh } = useReport(
    () => withPrevious(pos.api.reports.sales(range, group), pos.api.reports.sales(previousRange(range), 'day')),
    [range.from, range.to, group],
  );
  onRefreshRef(refresh);

  const s = data?.cur;
  const prev = data?.prev ?? null;
  const shares = s ? methodShares(s.by_method) : null;
  const ratios = s ? barRatios(s.rows.map((r) => r.revenue)) : [];
  const rows = s ? (expanded ? s.rows : s.rows.slice(0, COLLAPSED)) : [];

  return (
    <>
      <Status loading={loading && !s} error={error} ready={!!s} />
      {s && shares && (
        <>
          <Hero title="Tushum" value={s.total_revenue}>
            <Delta cur={s.total_revenue} prev={prev?.total_revenue ?? null} label="oldingi davrga nisbatan" />
          </Hero>

          <KpiGrid
            items={[
              { label: 'Buyurtmalar', value: String(s.order_count), sub: <Delta cur={s.order_count} prev={prev?.order_count ?? null} label="" /> },
              { label: "O'rtacha chek", value: formatMoney(s.avg_check, false), sub: <Delta cur={s.avg_check} prev={prev?.avg_check ?? null} label="" /> },
              { label: 'Chegirmalar', value: formatMoney(s.discount_total, false) },
              { label: 'Bekor qilingan', value: String(s.cancelled_orders) },
            ]}
          />

          <Block title="To'lov turlari">
            <StackBar parts={(['cash', 'card', 'other'] as const).map((k) => ({ share: shares[k], shade: SHADES[k] }))} />
            {(['cash', 'card', 'other'] as const).map((k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Dot shade={SHADES[k]} />
                <Txt size={15} style={{ flex: 1 }}>
                  {METHOD_LABEL[k]} · {shares[k]}%
                </Txt>
                <Txt family="mono" size={15} weight={500}>
                  {formatMoney(s.by_method[k])}
                </Txt>
              </View>
            ))}
          </Block>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GROUPS.map((g) => (
              <Chip key={g.id} label={g.label} active={group === g.id} onPress={() => { setGroup(g.id); setExpanded(false); }} />
            ))}
          </View>

          <Block title={GROUPS.find((g) => g.id === group)?.label ?? ''}>
            {s.rows.length === 0 && <Txt tone="muted">Bu davrda ma'lumot yo'q.</Txt>}
            {rows.map((r, i) => (
              <Row
                key={`${r.key}-${i}`}
                left={rowLabel(group, r)}
                sub={rowSub(group, r)}
                right={formatMoney(r.revenue)}
                bar={<HBar ratio={ratios[i] ?? 0} strong={i === 0 && group !== 'day'} />}
              />
            ))}
            <ShowMore total={s.rows.length} shown={COLLAPSED} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
          </Block>

          <Button title="Hisobotni ulashish" variant="ghost" onPress={() => void Share.share({ message: salesText(s, range, restaurant) })} />
        </>
      )}
    </>
  );
}
