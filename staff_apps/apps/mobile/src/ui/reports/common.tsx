import {
  canShiftForward,
  deltaPercent,
  formatDelta,
  formatMoney,
  matchPreset,
  PERIOD_PRESETS,
  presetRange,
  rangeLabel,
  shiftRange,
  type DateRange,
  type Decimal,
} from '@pos/shared';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Card, ErrorText, Muted, Txt } from '../kit';
import { Chip } from '../parts';
import { useTheme } from '../theme';

/** Yuklanish / xato holati uchun yagona joy. */
export function Status({ loading, error, ready }: { loading: boolean; error: string | null; ready: boolean }) {
  return (
    <>
      {error && <ErrorText>{error}</ErrorText>}
      {!ready && !error && loading && <Muted>Yuklanmoqda...</Muted>}
    </>
  );
}

/** Taqqoslash: oshdi = yashil, kamaydi = to'q sariq (qizil emas - bu xato emas). Oldingisi 0 bo'lsa ko'rsatilmaydi. */
export function Delta({ cur, prev, label }: { cur: Decimal | number; prev: Decimal | number | null; label: string }) {
  if (prev === null) return null;
  const d = deltaPercent(cur, prev);
  if (d === null) return null;
  return (
    <Txt size={13} weight={500} tone={d > 0 ? 'ok' : d < 0 ? 'warnInk' : 'muted'}>
      {formatDelta(d)} {label}
    </Txt>
  );
}

/** Katta raqamli kartochka (asosiy ko'rsatkich). */
export function Hero({ title, value, children }: { title: string; value: Decimal; children?: ReactNode }) {
  return (
    <Card>
      <Txt size={14} weight={500} tone="muted">
        {title}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Txt family="mono" weight={500} size={34}>
          {formatMoney(value, false)}
        </Txt>
        <Txt size={16} tone="muted">
          soʼm
        </Txt>
      </View>
      {children}
    </Card>
  );
}

/** 2 ustunli kichik ko'rsatkichlar to'ri. */
export function KpiGrid({ items }: { items: { label: string; value: string; sub?: ReactNode }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexBasis: '47%', flexGrow: 1 }}>
          <Card style={{ minHeight: 88, justifyContent: 'center', gap: 4 }}>
            <Txt size={13} weight={500} tone="muted">
              {it.label}
            </Txt>
            <Txt family="mono" weight={500} size={20}>
              {it.value}
            </Txt>
            {it.sub}
          </Card>
        </View>
      ))}
    </View>
  );
}

/** Bo'lim sarlavhasi + kartochka. */
export function Block({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Txt size={15} weight={600}>
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </Card>
  );
}

/** Ro'yxat qatori: chap yorliq, o'ng qiymat, ostida (ixtiyoriy) chiziq. */
export function Row({ left, sub, right, bar }: { left: string; sub?: string; right: string; bar?: ReactNode }) {
  return (
    <View style={{ gap: 6, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt size={16} weight={500} numberOfLines={1}>
            {left}
          </Txt>
          {sub ? (
            <Txt size={13} tone="muted">
              {sub}
            </Txt>
          ) : null}
        </View>
        <Txt family="mono" size={15} weight={500}>
          {right}
        </Txt>
      </View>
      {bar}
    </View>
  );
}

/** "Hammasi (N)" / "Kamroq": uzun ro'yxatni qisqartirish tugmasi. */
export function ShowMore({ total, shown, expanded, onToggle }: { total: number; shown: number; expanded: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  if (total <= shown) return null;
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Txt size={15} weight={600} style={{ color: c.ink60 }}>
        {expanded ? 'Kamroq' : `Hammasi (${total})`}
      </Txt>
    </Pressable>
  );
}

/**
 * Davr tanlash: tayyor tugmalar (Bugun/Kecha/7 kun/Shu oy) + ‹ davr › (davrni o'z uzunligicha suradi).
 * `single` - bitta kunlik hisobot (bosh panel): faqat Bugun/Kecha.
 */
export function PeriodBar({ range, onChange, single }: { range: DateRange; onChange: (r: DateRange) => void; single?: boolean }) {
  const { c } = useTheme();
  const active = matchPreset(range);
  const presets = single ? PERIOD_PRESETS.filter((p) => p.id === 'today' || p.id === 'yesterday') : PERIOD_PRESETS;
  const arrow = (dir: 1 | -1, enabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir === 1 ? 'Keyingi davr' : 'Oldingi davr'}
      disabled={!enabled}
      onPress={() => onChange(shiftRange(range, dir))}
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.grid,
        backgroundColor: c.card,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <Txt size={22} weight={600}>
        {dir === 1 ? '›' : '‹'}
      </Txt>
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {presets.map((p) => (
          <Chip key={p.id} label={p.label} active={active === p.id} onPress={() => onChange(presetRange(p.id))} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {arrow(-1, true)}
        <Txt size={17} weight={600} align="center" style={{ flex: 1 }}>
          {rangeLabel(range)}
        </Txt>
        {arrow(1, canShiftForward(range))}
      </View>
    </View>
  );
}
