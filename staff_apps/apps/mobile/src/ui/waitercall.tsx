import { waiterCallTableLabel } from '@pos/shared';
import { Modal, Vibration, View } from 'react-native';

import { useWaiterCalls } from '@/lib/hooks';

import { Button, Txt } from './kit';
import { useTheme } from './theme';

/** Uch marta uzun tebranish - cho'ntakdagi telefonda ham sezilsin. */
const VIBRATION = [0, 500, 250, 500, 250, 500];

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Mijoz QR saytidan ofitsiant chaqirsa, ilova qaysi ekranda bo'lmasin, ustidan chiqadi.
 * Faqat ilova ochiq paytda ishlaydi (WebSocket); "Ko'rdim" bosilguncha turadi.
 */
export function WaiterCallAlert() {
  const { c } = useTheme();
  const { calls, dismiss } = useWaiterCalls(() => Vibration.vibrate(VIBRATION));
  const call = calls[0];
  if (!call) return null;
  const close = () => {
    Vibration.cancel();
    dismiss(call.tableId);
  };
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 2, borderColor: c.signal, padding: 24, gap: 10 }}>
          <Txt size={14} weight={600} tone="signal" upper>
            Mijoz chaqiryapti
          </Txt>
          <Txt family="disp" size={56}>
            {waiterCallTableLabel(call.tableName)}
          </Txt>
          <Txt size={18}>
            {call.reason}
            {call.count > 1 ? ` · ${call.count} marta` : ''}
          </Txt>
          <Txt size={14} tone="muted">
            {clock(call.at)}
            {calls.length > 1 ? ` · yana ${calls.length - 1} ta chaqiruv` : ''}
          </Txt>
          <View style={{ marginTop: 8 }}>
            <Button title="Ko'rdim" onPress={close} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
