import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_VERSION, type AppUpdateState } from '@/lib/update';

import { Button, Txt } from './kit';
import { useTheme } from './theme';

function open(url: string | null) {
  // Android yuklab olish menejeri faylni oladi; tugagach "O'rnatish"ni bosish kifoya (APK jim o'rnatilmaydi).
  if (url) void Linking.openURL(url);
}

/** Majburiy yangilanish: ilovaning qolgan qismiga yo'l yo'q. */
export function UpdateRequired({ state }: { state: AppUpdateState }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const latest = state.info?.latest;
  if (!latest) return null;
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, gap: 16 }}>
      <Txt size={14} weight={500} tone="muted">
        Majburiy yangilanish
      </Txt>
      <Txt family="disp" size={40}>
        Yangi versiya {latest.version}
      </Txt>
      <Txt size={16} tone="muted">
        Ilovangiz versiyasi ({APP_VERSION}) eskirgan. Davom etish uchun yangilang: faylni yuklab oling va "O'rnatish"ni bosing.
      </Txt>
      {latest.notes.map((n) => (
        <Txt key={n} size={15} tone="muted">
          • {n}
        </Txt>
      ))}
      <Button title="Yangilash" onPress={() => open(state.downloadUrl)} />
    </View>
  );
}

/** Ixtiyoriy yangilanish: pastdan tinch eslatma. */
export function UpdateBanner({ state }: { state: AppUpdateState }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const latest = state.info?.latest;
  if (!latest) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 12,
        backgroundColor: c.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: c.grid,
        padding: 14,
        gap: 10,
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 10,
      }}
    >
      <Txt size={16} weight={500}>
        Yangi versiya {latest.version} tayyor
      </Txt>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title="Keyinroq" variant="ghost" compact onPress={state.dismiss} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Yangilash" compact onPress={() => open(state.downloadUrl)} />
        </View>
      </View>
    </View>
  );
}
