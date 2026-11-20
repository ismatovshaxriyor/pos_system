import { barRatios, formatMoney } from '@pos/shared';
import { useState } from 'react';

import { pos } from '@/lib/pos';
import { useReport } from '@/lib/reports';

import { Txt } from '../kit';
import { HBar } from '../charts';
import { Block, Hero, KpiGrid, Row, ShowMore, Status } from './common';

/** Qarz (nasiya) va ombor: kunga bog'liq emas - hozirgi holat. */
export function FinanceSection({ onRefreshRef }: { onRefreshRef: (fn: () => Promise<void>) => void }) {
  const debts = useReport(() => pos.api.reports.debts(), []);
  const stock = useReport(() => pos.api.reports.inventory(), []);
  const [allDebtors, setAllDebtors] = useState(false);
  onRefreshRef(async () => {
    await Promise.all([debts.refresh(), stock.refresh()]);
  });

  const dd = debts.data;
  const inv = stock.data;
  const ratios = barRatios((dd?.top_debtors ?? []).map((x) => x.balance));
  const debtors = allDebtors ? (dd?.top_debtors ?? []) : (dd?.top_debtors ?? []).slice(0, 5);

  return (
    <>
      <Status loading={debts.loading && stock.loading} error={debts.error ?? stock.error} ready={!!dd || !!inv} />

      {dd && (
        <>
          <Hero title="Jami qarzdorlik" value={dd.total_outstanding}>
            <Txt size={14} tone="muted">
              {dd.debtor_count} ta qarzdor
            </Txt>
          </Hero>
          <KpiGrid
            items={[
              { label: 'Bugun nasiyaga', value: formatMoney(dd.credit_sales_today, false) },
              { label: 'Bugun qaytarildi', value: formatMoney(dd.repayments_today, false) },
            ]}
          />
          <Block title="Eng katta qarzdorlar">
            {dd.top_debtors.length === 0 && <Txt tone="muted">Qarzdor yo'q.</Txt>}
            {debtors.map((c, i) => (
              <Row
                key={c.id}
                left={c.name || c.phone || `#${c.id}`}
                sub={c.name ? c.phone : undefined}
                right={formatMoney(c.balance)}
                bar={<HBar ratio={ratios[i] ?? 0} strong={i === 0} />}
              />
            ))}
            <ShowMore total={dd.top_debtors.length} shown={5} expanded={allDebtors} onToggle={() => setAllDebtors((v) => !v)} />
          </Block>
        </>
      )}

      {inv && (
        <>
          <Hero title="Ombor qiymati" value={inv.total_value}>
            <Txt size={14} tone="muted">
              {inv.ingredient_count} xil xom-ashyo
            </Txt>
          </Hero>
          <KpiGrid
            items={[
              { label: 'Bugungi sarf', value: inv.consumed_units_today },
              { label: 'Bugungi xarid', value: formatMoney(inv.purchased_cost_today, false) },
            ]}
          />
          <Block title={`Kam qolgan (${inv.low_stock_count})`}>
            {inv.low_stock.length === 0 && <Txt tone="muted">Hammasi yetarli.</Txt>}
            {inv.low_stock.map((i) => (
              <Row key={i.id} left={i.name} sub={`kamida ${trim(i.min_stock)} ${i.unit}`} right={`${trim(i.current_stock)} ${i.unit}`} />
            ))}
          </Block>
        </>
      )}
    </>
  );
}

/** '2.500' -> '2.5' (serverdan keladigan ortiqcha nollar ko'rinmasin). */
function trim(v: string): string {
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
}
