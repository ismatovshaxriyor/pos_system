import { describeError } from '@pos/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { pos } from '@/lib/pos';
import { Button, ErrorText, Eyebrow, Muted, Screen, Title } from '@/ui/kit';

/** Litsenziya kill-switch: server 402 yoki WS 4402 qaytargan. */
export default function BlockedScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>Litsenziya</Eyebrow>
        <Title size={44}>Tizim bloklangan</Title>
      </View>
      <Muted>Restoran litsenziyasi faol emas. To'lovni amalga oshiring yoki menejer bilan bog'laning.</Muted>
      {message && <ErrorText>{message}</ErrorText>}
      <Button title="Qayta tekshirish" onPress={recheck} loading={busy} />
    </Screen>
  );
}
