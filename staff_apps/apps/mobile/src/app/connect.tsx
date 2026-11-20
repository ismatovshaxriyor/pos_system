import { describeError } from '@pos/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { pos } from '@/lib/pos';
import { Button, ErrorText, Eyebrow, Field, Muted, Screen, Title } from '@/ui/kit';

/**
 * Birinchi ishga tushirish: restoran serveri (Bola) manzili.
 * TODO: mDNS avto-topish (`_pos-bola._tcp`, `local_server/pos-bola.avahi.service`) -
 * native modul (react-native-zeroconf) va development build talab qiladi, Expo Go'da ishlamaydi.
 * Hozircha qo'lda kiritiladi.
 */
export default function ConnectScreen() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await pos.connectToServer(url);
      // Muvaffaqiyatli bo'lsa root layout guard'lari login ekraniga o'zi o'tkazadi.
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>HamrohPOS · Xodim</Eyebrow>
        <Title size={44}>Restoran serveriga ulanish</Title>
      </View>
      <Muted>Telefon restoran WiFi tarmog'ida bo'lishi kerak. Server manzilini menejerdan oling (masalan 192.168.1.50:8000).</Muted>
      <Field
        label="Server manzili"
        value={url}
        onChangeText={setUrl}
        placeholder="192.168.1.50:8000"
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={connect}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Ulanish" onPress={connect} loading={busy} disabled={!url.trim()} />
    </Screen>
  );
}
