import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { View } from 'react-native';

import { Button, LinkButton, Muted, Txt } from '@/ui/kit';

/**
 * QR skaner (kamera). `onScan` har bir o'qilgan QR matni bilan chaqiriladi - chaqiruvchi mos kelmasa
 * `false` qaytaradi va skaner davom etadi (kalit emas, boshqa QR). Bir xil kod tez-tez takrorlanmasligi uchun
 * ketma-ket o'qishlar orasida pauza bor.
 */
export function QrScanner({ onScan, onCancel, hint }: { onScan: (data: string) => boolean | void; onCancel: () => void; hint?: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastAt = useRef(0);

  if (!permission) return <Muted>Kamera tekshirilmoqda...</Muted>;

  if (!permission.granted) {
    return (
      <View style={{ gap: 12 }}>
        <Muted>
          {permission.canAskAgain
            ? 'QR kodni skanerlash uchun kameraga ruxsat bering.'
            : "Kameraga ruxsat berilmagan. Telefon sozlamalaridan ilovaga kamera ruxsatini bering yoki kalitni qo'lda kiriting."}
        </Muted>
        {permission.canAskAgain && <Button title="Kameraga ruxsat berish" onPress={() => void requestPermission()} />}
        <LinkButton title="Bekor qilish" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(r) => {
            const now = Date.now();
            if (now - lastAt.current < 1500) return;
            lastAt.current = now;
            onScan(r.data);
          }}
        />
      </View>
      <Txt size={14} tone="muted" style={{ textAlign: 'center' }}>
        {hint ?? 'QR kodni kvadrat ichiga to‘g‘rilang'}
      </Txt>
      <LinkButton title="Bekor qilish" onPress={onCancel} />
    </View>
  );
}
