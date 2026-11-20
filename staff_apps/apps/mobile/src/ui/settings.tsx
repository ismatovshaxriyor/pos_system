import { HAND_LAYOUTS, type HandLayout, type TextScale, type ThemePref } from '@pos/design';
import { Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Segmented, Txt } from './kit';
import { useTheme } from './theme';

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Kun' },
  { value: 'night', label: 'Tun' },
  { value: 'auto', label: 'Avto' },
];
const SCALES: { value: TextScale; label: string }[] = [
  { value: 'normal', label: 'Oddiy' },
  { value: 'large', label: 'Katta' },
  { value: 'xlarge', label: 'Juda katta' },
];

/** Mini-chizma: tanlangan uslubda mahsulot qatorida tugmalar qayerda turishi. */
function HandDiagram({ id }: { id: HandLayout }) {
  const { c } = useTheme();
  const bar = <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.edge }} />;
  const dot = (filled: boolean) => (
    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: filled ? c.ink60 : c.panel, borderWidth: 1, borderColor: c.edge }} />
  );
  const row = { flexDirection: 'row', alignItems: 'center', gap: 4 } as const;
  return (
    <View style={{ width: 84, gap: 4 }}>
      {id === 'right' && <View style={row}>{bar}{dot(true)}</View>}
      {id === 'left' && <View style={row}>{dot(true)}{bar}</View>}
      {id === 'both-edges' && <View style={row}>{dot(false)}{bar}{dot(true)}</View>}
      {id === 'both-split' && (
        <>
          <View style={row}>{bar}</View>
          <View style={row}>
            <View style={{ flex: 1, height: 14, borderRadius: 4, backgroundColor: c.panel, borderWidth: 1, borderColor: c.edge }} />
            <View style={{ flex: 1, height: 14, borderRadius: 4, backgroundColor: c.ink60 }} />
          </View>
        </>
      )}
    </View>
  );
}

/**
 * ☰ sozlamalar: ko'z uchun (mavzu, matn o'lchami, harakat) + "Chiqish".
 * Pastdan chiqadigan varaq; tashqarisiga bosilsa yopiladi.
 */
export function SettingsSheet({
  visible,
  who,
  onClose,
  onSignOut,
}: {
  visible: boolean;
  who: string;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const { c, appearance, setAppearance } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType={appearance.reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.dim }} onPress={onClose} accessibilityLabel="Yopish" />
      <View
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '86%',
          paddingBottom: insets.bottom + 12,
        }}
      >
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.edge }} />
          <View>
            <Txt size={14} weight={500} tone="muted">
              {who}
            </Txt>
            <Txt family="disp" size={38}>
              Sozlamalar
            </Txt>
          </View>

          <View style={{ gap: 8 }}>
            <Txt size={17} weight={500}>
              Qo'lga moslash
            </Txt>
            <Txt size={14} tone="muted">
              Tugmalar qaysi qo'lingizga qulay joylashsin
            </Txt>
            {HAND_LAYOUTS.map((l) => {
              const on = appearance.hand === l.id;
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setAppearance({ hand: l.id })}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    minHeight: 64,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: on ? c.ink60 : c.grid,
                    backgroundColor: on ? c.sel : c.card,
                  }}
                >
                  <HandDiagram id={l.id} />
                  <View style={{ flex: 1 }}>
                    <Txt size={16} weight={600}>
                      {l.label}
                    </Txt>
                    <Txt size={13} tone="muted">
                      {l.hint}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: 8 }}>
            <Txt size={17} weight={500}>
              Mavzu
            </Txt>
            <Txt size={14} tone="muted">
              Avto: 19:00 dan keyin tungi mavzu
            </Txt>
            <Segmented value={appearance.theme} options={THEMES} onChange={(theme) => setAppearance({ theme })} />
          </View>

          <View style={{ gap: 8 }}>
            <Txt size={17} weight={500}>
              Matn o'lchami
            </Txt>
            <Segmented value={appearance.textScale} options={SCALES} onChange={(textScale) => setAppearance({ textScale })} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56 }}>
            <View style={{ flex: 1 }}>
              <Txt size={17} weight={500}>
                Harakatni kamaytirish
              </Txt>
              <Txt size={14} tone="muted">
                Animatsiyalarsiz, tinch
              </Txt>
            </View>
            <Switch
              value={appearance.reduceMotion}
              onValueChange={(reduceMotion) => setAppearance({ reduceMotion })}
              trackColor={{ false: c.grid, true: c.ok }}
              thumbColor={c.card}
              accessibilityLabel="Harakatni kamaytirish"
            />
          </View>

          <Button title="Smenani tugatish (chiqish)" variant="danger" onPress={onSignOut} />
          <Button title="Yopish" variant="ghost" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}
