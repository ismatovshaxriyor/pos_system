import { describeError, formatLicenseKey, isCompleteLicenseKey } from '@pos/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { pos } from '@/lib/pos';
import { Button, ErrorText, Eyebrow, Field, LinkButton, Muted, Screen, Title } from '@/ui/kit';

/**
 * Yangi (hali faollashtirilmagan) restoran tizimi: litsenziya kaliti kiritiladi. Muvaffaqiyatli bo'lsa
 * root layout guard'lari login ekraniga o'zi o'tkazadi (menejer akkaunti markaziy tizimdan avtomatik keladi).
 */
export default function SetupScreen() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    if (!isCompleteLicenseKey(key)) return;
    setBusy(true);
    setError(null);
    try {
      await pos.activateLicense(key);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>HamrohPOS · Xodim</Eyebrow>
        <Title size={44}>Restoranni sozlash</Title>
      </View>
      <Muted>Bu restoran tizimi hali sozlanmagan. HamrohPOS bergan litsenziya kalitini kiriting.</Muted>
      <Field
        label="Litsenziya kaliti"
        value={key}
        onChangeText={(t) => setKey(formatLicenseKey(t))}
        placeholder="XXXX-XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={activate}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Faollashtirish" onPress={activate} loading={busy} disabled={!isCompleteLicenseKey(key)} />
      <LinkButton title="Boshqa restoranga ulanish" onPress={() => void pos.session.clearServer()} />
    </Screen>
  );
}
