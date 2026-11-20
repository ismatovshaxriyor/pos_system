import { isoDay, presetRange, type DateRange } from '@pos/shared';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { Button, ErrorText, Eyebrow, Screen, Segmented, Title } from '@/ui/kit';
import { FinanceSection } from '@/ui/reports/finance';
import { PanelSection } from '@/ui/reports/panel';
import { PeriodBar } from '@/ui/reports/common';
import { SalesSection } from '@/ui/reports/sales';
import { StaffSection } from '@/ui/reports/staff';
import { useHand } from '@/ui/theme';

type Tab = 'panel' | 'sales' | 'staff' | 'finance';
const TABS: { value: Tab; label: string }[] = [
  { value: 'panel', label: 'Panel' },
  { value: 'sales', label: 'Sotuv' },
  { value: 'staff', label: 'Xodim' },
  { value: 'finance', label: 'Qarz' },
];

/**
 * Menejer hisobotlari. Bo'limlar:
 *  - Panel: bir kunlik KPI'lar (bugun jonli yangilanadi), oldingi kun bilan taqqoslash, soatlik grafik, top taomlar;
 *  - Sotuv: ixtiyoriy davr (7 kun/oy/surish), kunlar/ofitsiantlar/taomlar/toifalar kesimi;
 *  - Xodim: ofitsiant tushumi va hozir ishdagilar;
 *  - Qarz: nasiya va ombor (hozirgi holat).
 * Pastga tortib yangilash va "ulashish" (Telegram/SMS) bor. Server huquqni baribir tekshiradi (faqat menejer).
 */
export default function ReportsScreen() {
  const { user } = useSession();
  const hand = useHand();
  const isManager = user?.role === 'manager';
  const [tab, setTab] = useState<Tab>('panel');
  const [day, setDay] = useState<DateRange>(() => presetRange('today'));
  const [range, setRange] = useState<DateRange>(() => presetRange('week'));
  const [refreshing, setRefreshing] = useState(false);
  const refreshFn = useRef<(() => Promise<void>) | null>(null);
  const bind = (fn: () => Promise<void>) => {
    refreshFn.current = fn;
  };

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshFn.current?.();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen onRefresh={isManager ? () => void onRefresh() : undefined} refreshing={refreshing}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Menejer</Eyebrow>
          <Title size={48}>Hisobotlar</Title>
        </View>
        <Button title="← Stollar" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}

      {isManager && (
        <>
          <Segmented value={tab} options={TABS} onChange={setTab} />

          {tab === 'panel' && <PeriodBar single range={day} onChange={(r) => setDay({ from: r.to, to: r.to })} />}
          {(tab === 'sales' || tab === 'staff') && <PeriodBar range={range} onChange={setRange} />}

          {tab === 'panel' && <PanelSection day={day.to || isoDay(new Date())} onRefreshRef={bind} />}
          {tab === 'sales' && <SalesSection range={range} onRefreshRef={bind} />}
          {tab === 'staff' && <StaffSection range={range} onRefreshRef={bind} />}
          {tab === 'finance' && <FinanceSection onRefreshRef={bind} />}
        </>
      )}
    </Screen>
  );
}
