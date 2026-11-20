import { barRatios, type Decimal } from '@pos/shared';
import { View } from 'react-native';

import { Txt } from './kit';
import { useTheme } from './theme';

/** Gorizontal chiziq: qiymatning eng kattasiga nisbati (0..1). Rang faqat ink - qizil/yashil holat uchun saqlanadi. */
export function HBar({ ratio, strong }: { ratio: number; strong?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.panel, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor: strong ? c.ink : c.ink60,
        }}
      />
    </View>
  );
}

/** Bitta chiziqda bir nechta ulush (naqd/karta/boshqa). `parts[i].share` - foiz. */
export function StackBar({ parts }: { parts: { share: number; shade: 'ink' | 'ink60' | 'edge' }[] }) {
  const { c } = useTheme();
  const color = { ink: c.ink, ink60: c.ink60, edge: c.edge };
  const visible = parts.filter((p) => p.share > 0);
  return (
    <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.panel, gap: 2 }}>
      {visible.map((p, i) => (
        <View key={i} style={{ flex: p.share, backgroundColor: color[p.shade] }} />
      ))}
    </View>
  );
}

export function Dot({ shade }: { shade: 'ink' | 'ink60' | 'edge' }) {
  const { c } = useTheme();
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: { ink: c.ink, ink60: c.ink60, edge: c.edge }[shade] }} />;
}

/**
 * Vertikal ustunli grafik (soatlik tushum). Eng baland ustun to'q rangda, qolganlari ink-60;
 * tushumsiz soat - ingichka iz. Yorliq har `labelEvery`-ustunda.
 */
export function ColumnChart({
  data,
  height = 96,
  labelEvery = 3,
}: {
  data: { label: string; value: Decimal | number }[];
  height?: number;
  labelEvery?: number;
}) {
  const { c } = useTheme();
  const ratios = barRatios(data.map((d) => d.value));
  const peak = ratios.indexOf(Math.max(...ratios, 0));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }}>
        {ratios.map((r, i) => (
          <View
            key={data[i]?.label ?? i}
            style={{
              flex: 1,
              height: Math.max(3, Math.round(r * height)),
              borderRadius: 3,
              backgroundColor: r === 0 ? c.panel : i === peak ? c.ink : c.ink60,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {data.map((d, i) => (
          <View key={d.label} style={{ flex: 1, alignItems: 'center' }}>
            {i % labelEvery === 0 && (
              <Txt size={11} tone="muted" align="center">
                {d.label.slice(0, 2)}
              </Txt>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
