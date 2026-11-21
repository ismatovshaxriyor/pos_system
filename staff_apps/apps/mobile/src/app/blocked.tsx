import { describeError } from '@pos/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { pos } from '@/lib/pos';
import { Button, ErrorText, Eyebrow, Field, Muted, Screen, Title } from '@/ui/kit';

/** Litsenziya kill-switch: server 402 yoki WS 4402 qaytargan. */
export default function BlockedScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');

  async function recheck() {
    setBusy(true);
    setMessage(null);
    try {
      const unblocked = await pos.recheckLicense();
      if (!unblocked) setMessage('Tizim hali ham bloklangan.');
    } catch (e) {
      setMessage(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  // Internet yo'q joyda: Ona admini yuborgan oflayn tokenni kiritish (Bola uni internetsiz tekshiradi).
  async function applyToken() {
    setBusy(true);
    setMessage(null);
    try {
      const unblocked = await pos.applyOfflineToken(token);
      if (!unblocked) setMessage("Token qabul qilindi, lekin tizim hali ham bloklangan. Menejer bilan bog'laning.");
    } catch (e) {
      setMessage(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>Litsenziya</Eyebrow>
        <Title size={44}>Tizim bloklangan</Title>
      </View>
      <Muted>Restoran litsenziyasi faol emas. To'lovni amalga oshiring yoki menejer bilan bog'laning.</Muted>
      {message && <ErrorText>{message}</ErrorText>}
      <Button title="Qayta tekshirish" onPress={recheck} loading={busy} />
      <Button
        title="Internet yo'qmi? Oflayn token kiritish"
        onPress={() => setShowToken((v) => !v)}
        variant="ghost"
        disabled={busy}
      />
      {showToken && (
        <View style={{ gap: 12 }}>
          <Field label="Oflayn token (Telegram/SMS orqali yuborilgan)" value={token} onChangeText={setToken} placeholder="eyJ..." multiline />
          <Button title="Tokenni qo'llash" onPress={applyToken} loading={busy} disabled={token.trim().length < 20} />
        </View>
      )}
    </Screen>
  );
}
