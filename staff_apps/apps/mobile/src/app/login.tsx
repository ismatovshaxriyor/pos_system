import { ApiError, describeError, formatPhone, normalizePhone, WrongAppError } from '@pos/shared';
import * as Device from 'expo-device';
import { useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { pos } from '@/lib/pos';
import { Button, ErrorText, Eyebrow, Field, LinkButton, Muted, Screen, Segmented, Title } from '@/ui/kit';

type Mode = 'waiter' | 'manager';

export default function LoginScreen() {
  const session = useSession();
  const [mode, setMode] = useState<Mode>('waiter');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("Telefon raqam noto'g'ri. Masalan: +998 90 123 45 67");
      return;
    }
    setBusy(true);
    setError(null);
    setPending(false);
    try {
      if (mode === 'waiter') {
        await pos.loginWaiter(normalized, password, Device.deviceName ?? Device.modelName ?? undefined);
      } else {
        await pos.loginManager(normalized, password);
      }
      // Kirdi: root layout guard'i asosiy ekranga o'tkazadi.
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'forbidden' && mode === 'waiter') {
        // Yangi qurilma: server "Menejer tasdig'i kutilmoqda" deydi, bu xato emas - kutish holati.
        setPending(true);
      }
      setError(e instanceof WrongAppError ? e.message : describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>HamrohPOS · Xodim</Eyebrow>
        <Title size={52}>Kirish</Title>
      </View>
      {session.notice && <ErrorText>{session.notice}</ErrorText>}
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setPending(false);
        }}
        options={[
          { value: 'waiter', label: 'Ofitsiant' },
          { value: 'manager', label: 'Menejer' },
        ]}
      />
      <Field label="Telefon raqam" value={phone} onChangeText={(t) => setPhone(formatPhone(t))} keyboardType="phone-pad" textContentType="username" />
      <Field label="Parol" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
      {pending ? (
        <Muted>Bu yangi qurilma. Menejer tasdiqlagach qayta kiring - menejerga bildirishnoma yuborildi.</Muted>
      ) : (
        error && <ErrorText>{error}</ErrorText>
      )}
      <Button title="Kirish" onPress={submit} loading={busy} disabled={!password} />
      <LinkButton title="Serverni o'zgartirish" onPress={() => void pos.session.clearServer()} />
    </Screen>
  );
}
