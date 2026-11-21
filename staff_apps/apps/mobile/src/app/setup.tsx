import { describeError, extractLicenseKey, formatLicenseKey, isCompleteLicenseKey } from '@pos/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { pos } from '@/lib/pos';
import { Button, ErrorText, Eyebrow, Field, LinkButton, Muted, Screen, Title } from '@/ui/kit';
import { QrScanner } from '@/ui/qrscan';

/**
 * Yangi (hali faollashtirilmagan) restoran tizimi: litsenziya kaliti kiritiladi. Muvaffaqiyatli bo'lsa
 * root layout guard'lari login ekraniga o'zi o'tkazadi (menejer akkaunti markaziy tizimdan avtomatik keladi).
 */
export default function SetupScreen() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  async function activate(value: string = key) {
    if (!isCompleteLicenseKey(value) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pos.activateLicense(value);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  /** QR o'qildi: kalit bo'lsa maydonga qo'yib darhol faollashtiramiz; boshqa QR bo'lsa skaner davom etadi. */
  function onScan(data: string): boolean {
    const found = extractLicenseKey(data);
    if (!found) {
      setError('Bu litsenziya QR kodi emas. HamrohPOS bergan QR kodni skanerlang.');
      return false;
    }
    setScanning(false);
    setKey(found);
    void activate(found);
    return true;
  }

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>HamrohPOS · Xodim</Eyebrow>
        <Title size={44}>Restoranni sozlash</Title>
      </View>
      <Muted>Bu restoran tizimi hali sozlanmagan. HamrohPOS bergan litsenziya kalitini kiriting.</Muted>
      {scanning ? (
        <QrScanner onScan={onScan} onCancel={() => setScanning(false)} hint="HamrohPOS bergan litsenziya QR kodini ko‘rsating" />
      ) : (
        <Button
          title="QR kodni skanerlash"
          variant="ghost"
          onPress={() => {
            setError(null);
            setScanning(true);
          }}
        />
      )}
      {error && scanning && <ErrorText>{error}</ErrorText>}
      <Field
        label="Litsenziya kaliti"
        value={key}
        onChangeText={(t) => setKey(formatLicenseKey(t))}
        placeholder="XXXX-XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={() => void activate()}
      />
      {error && !scanning && <ErrorText>{error}</ErrorText>}
      <Button title="Faollashtirish" onPress={() => void activate()} loading={busy} disabled={!isCompleteLicenseKey(key)} />
      <LinkButton title="Boshqa restoranga ulanish" onPress={() => void pos.session.clearServer()} />
    </Screen>
  );
}
