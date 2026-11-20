import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Switch, View } from 'react-native';

import { pickImage } from '@/lib/manage';
import type { ImageUpload } from '@pos/shared';
import { Button, Card, Muted, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/** Bitta qiymatni tanlash (chiplar): bo'lim, birlik, ta'minotchi kabilar uchun. */
export function ChipSelect<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Txt size={14} weight={500} tone="muted">
          {label}
        </Txt>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Button key={String(o.value)} title={o.label} compact variant={o.value === value ? 'primary' : 'ghost'} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** Yoqish/o'chirish qatori (matn + switch). */
export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={16}>{label}</Txt>
        {hint && <Muted>{hint}</Muted>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.signal }} />
    </View>
  );
}

/** Rasm maydoni: joriy rasm (server URL'i) yoki yangi tanlangan; "Rasm tanlash" galereyani ochadi. */
export function ImageField({
  label,
  current,
  picked,
  onPick,
}: {
  label: string;
  current?: string | null;
  picked: ImageUpload | null;
  onPick: (img: ImageUpload) => void;
}) {
  const uri = picked?.uri ?? current ?? null;
  return (
    <View style={{ gap: 8 }}>
      <Txt size={14} weight={500} tone="muted">
        {label}
      </Txt>
      {uri ? (
        <Image source={{ uri }} style={{ width: 120, height: 120, borderRadius: 14 }} contentFit="cover" />
      ) : (
        <Muted>Rasm yo'q</Muted>
      )}
      <Button
        title={uri ? "Rasmni almashtirish" : 'Rasm tanlash'}
        variant="ghost"
        compact
        onPress={async () => {
          const img = await pickImage();
          if (img) onPick(img);
        }}
      />
    </View>
  );
}

/** Bo'lim sarlavhasi + ixtiyoriy o'ng tomondagi amal. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
      <Txt size={14} weight={500} tone="muted" upper>
        {children}
      </Txt>
      {right}
    </View>
  );
}

/** Tahrirlash formasi uchun karta (sarlavha + tarkib). */
export function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Txt size={17} weight={600}>
        {title}
      </Txt>
      {children}
    </Card>
  );
}
