import { addDays, barRatios, fillHours, formatMoney, isoDay, methodShares, type DashboardReport } from '@pos/shared';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { pos } from '@/lib/pos';
import { dashboardText, useReport, withPrevious } from '@/lib/reports';

import { Button, Txt } from '../kit';
import { ColumnChart, Dot, HBar, StackBar } from '../charts';
import { Block, Delta, Hero, KpiGrid, Row, ShowMore, Status } from './common';

const SHADES = { cash: 'ink', card: 'ink60', other: 'edge' } as const;
const METHOD_LABEL = { cash: 'Naqd', card: 'Karta', other: 'Boshqa' } as const;

/** Bosh panel: bir kunlik KPI'lar + oldingi kun bilan taqqoslash. Bugun bo'lsa har daqiqa jimgina yangilanadi. */
export function PanelSection({ day, restaurant, onRefreshRef }: { day: string; restaurant?: string; onRefreshRef: (fn: () => Promise<void>) => void }) {
  const live = day === isoDay(new Date());
  const { data, error, loading, refresh } = useReport(
    () => withPrevious(pos.api.reports.dashboard(day), pos.api.reports.dashboard(addDays(day, -1))),
    [day],
    live ? 60_000 : undefined,
  );
  onRefreshRef(refresh);
  const [allProducts, setAllProducts] = useState(false);

  const d = data?.cur;
  const prev = data?.prev ?? null;

  return (
    <>
      <Status loading={loading} error={error} ready={!!d} />
      {d && <PanelBody d={d} prev={prev} restaurant={restaurant} allProducts={allProducts} onToggleProducts={() => setAllProducts((v) => !v)} />}
    </>
  );
}

function PanelBody({
  d,
  prev,
  restaurant,
  allProducts,
  onToggleProducts,
}: {
  d: DashboardReport;
  prev: DashboardReport | null;
  restaurant?: string;
  allProducts: boolean;
  onToggleProducts: () => void;
}) {
  const r = d.revenue;
  const shares = methodShares(r.by_method);
  const hours = fillHours(d.hourly_revenue);
  const productRatios = barRatios(d.top_products.map((p) => p.revenue));
  const products = allProducts ? d.top_products : d.top_products.slice(0, 5);
  const hasVoids = d.voids.voided_items > 0 || d.voids.voided_payments > 0 || r.cancelled_orders > 0;

  return (
    <>
      <Hero title="Tushum" value={r.total}>
        <Delta cur={r.total} prev={prev?.revenue.total ?? null} label="oldingi kunga nisbatan" />
      </Hero>

      <KpiGrid
        items={[
          {
            label: 'Buyurtmalar',
            value: String(r.order_count),
            sub: <Delta cur={r.order_count} prev={prev?.revenue.order_count ?? null} label="" />,
          },
          {
            label: "O'rtacha chek",
            value: formatMoney(r.avg_check, false),
            sub: <Delta cur={r.avg_check} prev={prev?.revenue.avg_check ?? null} label="" />,
          },
          { label: 'Chegirmalar', value: formatMoney(r.discount_total, false) },
          { label: 'Ochiq buyurtmalar', value: String(d.floor.open_orders), sub: <Txt size={13} tone="muted">{d.floor.occupied_tables} ta stol band</Txt> },
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
              {formatMoney(r.by_method[k])}
            </Txt>
          </View>
        ))}
      </Block>

      {d.hourly_revenue.length > 0 && (
        <Block title="Soatlik tushum">
          <ColumnChart data={hours.map((h) => ({ label: h.hour, value: h.revenue }))} />
          <Txt size={13} tone="muted">
            Eng gavjum soat: {peakHour(hours)}
          </Txt>
        </Block>
      )}

      {d.top_products.length > 0 && (
        <Block title="Top taomlar">
          {products.map((p, i) => (
            <Row
              key={p.name}
              left={`${i + 1}. ${p.name}`}
              sub={`${p.quantity} ta`}
              right={formatMoney(p.revenue)}
              bar={<HBar ratio={productRatios[i] ?? 0} strong={i === 0} />}
            />
          ))}
          <ShowMore total={d.top_products.length} shown={5} expanded={allProducts} onToggle={onToggleProducts} />
        </Block>
      )}

      <Block title="Zal">
        <Row left="Band stollar" right={String(d.floor.occupied_tables)} />
        <Row left="Ochiq buyurtmalar" right={String(d.floor.open_orders)} />
        <Row left="Hozir ishda" right={`${d.floor.active_staff} xodim`} />
      </Block>

      {hasVoids && (
        <Block title="Nazorat">
          <Txt size={13} tone="muted">
            Bekor qilinganlar tushumga kirmaydi; ko'p bo'lsa sababini so'rang.
          </Txt>
          {r.cancelled_orders > 0 && <Row left="Bekor qilingan buyurtmalar" right={String(r.cancelled_orders)} />}
          {d.voids.voided_items > 0 && <Row left="Bekor qilingan taomlar" right={String(d.voids.voided_items)} />}
          {d.voids.voided_payments > 0 && (
            <Row left="Bekor qilingan to'lovlar" sub={`${d.voids.voided_payments} ta`} right={formatMoney(d.voids.voided_payments_total)} />
          )}
        </Block>
      )}

      <Button
        title="Hisobotni ulashish"
        variant="ghost"
        onPress={() => void Share.share({ message: dashboardText(d, restaurant) })}
      />
    </>
  );
}

function peakHour(rows: { hour: string; revenue: string }[]): string {
  let best = rows[0];
  for (const r of rows) if (Number(r.revenue) > Number(best?.revenue ?? 0)) best = r;
  return best && Number(best.revenue) > 0 ? `${best.hour} (${formatMoney(best.revenue)})` : '—';
}
