import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickImage } from '@/lib/manage';
import type { ImageUpload } from '@pos/shared';
import { Button, Card, ErrorText, Muted, Txt } from '@/ui/kit';
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
  original = false,
}: {
  label: string;
  current?: string | null;
  picked: ImageUpload | null;
  onPick: (img: ImageUpload) => void;
  /** `true` - rasm kesilmasdan va qayta siqilmasdan olinadi (logo). */
  original?: boolean;
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
          const img = await pickImage({ original });
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

/**
 * Oxirgi bo'sh bo'lmagan qiymatni eslab qoladi. `FormSheet` yopilayotganda (pastga sirpanish animatsiyasi)
 * forma tarkibi bo'sh qolib, "chaqnab" ketmasin deb, `draft` null bo'lgandan keyin ham oxirgisini beradi.
 */
export function useHeld<T>(value: T | null): T | null {
  const ref = useRef<T | null>(value);
  if (value !== null) ref.current = value;
  return ref.current;
}

/**
 * Tahrirlash/yaratish formasi uchun pastdan chiquvchi oyna. Ro'yxat orqada o'z joyida turadi, shuning
 * uchun yopilgach foydalanuvchi o'sha joyda qoladi (forma ro'yxat tepasida chiqib, pastga scroll qildirmaydi).
 * Sarlavha, xato va tugmalar scroll'dan tashqarida: pastga tushmasdan saqlash/yopish mumkin.
 * Fon bosilganda yopilmaydi - yozilgan ma'lumot tasodifan yo'qolmasin.
 */
export function FormSheet({
  visible,
  title,
  onClose,
  onSave,
  saveTitle = 'Saqlash',
  closeTitle = 'Bekor qilish',
  busy = false,
  error,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Berilmasa pastki "Saqlash" tugmasi chiqmaydi (masalan ro'yxat oynasi). */
  onSave?: () => void;
  saveTitle?: string;
  closeTitle?: string;
  busy?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const { c, appearance } = useTheme();
  const insets = useSafeAreaInsets();

  // Android'da Modal ichida oyna klaviatura chiqqanda kichraymaydi (asosiy ekrandagidek emas): klaviatura
  // tugmalar va pastdagi maydonlarni yopib qo'yadi. Shuning uchun balandligini o'zimiz kuzatib, pastdan
  // shuncha bo'sh joy qoldiramiz. iOS'da KeyboardAvoidingView buni o'zi qiladi.
  const [kb, setKb] = useState(0);
  // Tekshiruv xatosi maydonlar to'g'rilangandan keyin ham qotib qolmasin: foydalanuvchi oyna ichiga
  // tegishi bilan yashiriladi. Xuddi shu xato qayta chiqsa (Saqlash qayta bosilganda) yana ko'rinadi.
  const [seenError, setSeenError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) setSeenError(null);
  }, [error]);
  const shownError = error && error !== seenError ? error : null;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={appearance.reduceMotion ? 'none' : 'slide'}
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.dim, paddingBottom: kb }}>
          <View
            style={{
              backgroundColor: c.paper,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '92%',
              paddingBottom: kb > 0 ? 12 : insets.bottom + 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt size={20} weight={600}>
                  {title}
                </Txt>
              </View>
              <Button title="Yopish" variant="ghost" compact disabled={busy} onPress={onClose} />
            </View>
            {shownError ? (
              <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                <ErrorText>{shownError}</ErrorText>
              </View>
            ) : null}
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 8, gap: 14 }}
              keyboardShouldPersistTaps="handled"
              onTouchStart={() => {
                if (error) setSeenError(error);
              }}
            >
              {children}
            </ScrollView>
            {onSave ? (
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button title={closeTitle} variant="ghost" disabled={busy} onPress={onClose} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={saveTitle}
                    loading={busy}
                    onPress={() => {
                      setSeenError(null);
                      onSave();
                    }}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
