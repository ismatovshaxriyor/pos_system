import { formatPhone, normalizePhone, parseDecimalInput, parseOptionalDecimal, trimDecimal, type ImageUpload, type RestaurantSettings } from '@pos/shared';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { FormCard, ImageField, SwitchRow } from '@/ui/forms';
import { Button, ErrorText, Eyebrow, Field, Muted, Screen, Title } from '@/ui/kit';
import { useHand } from '@/ui/theme';

interface Form {
  name: string;
  phone: string;
  publicDomain: string;
  serviceRate: string;
  restoreStock: boolean;
  latitude: string;
  longitude: string;
  radius: string;
  botToken: string;
  chatId: string;
  logo: ImageUpload | null;
}

function toForm(s: RestaurantSettings): Form {
  return {
    name: s.name,
    phone: s.phone ? formatPhone(s.phone) : '',
    publicDomain: s.public_domain,
    serviceRate: trimDecimal(s.service_charge_rate),
    restoreStock: s.restore_stock_on_cancel,
    latitude: s.latitude ?? '',
    longitude: s.longitude ?? '',
    radius: String(s.attendance_radius),
    botToken: s.telegram_bot_token,
    chatId: s.telegram_chat_id,
    logo: null,
  };
}

/** Koordinatani serverning `max_digits=9, decimal_places=6` formatiga keltiradi. */
const coord = (n: number) => n.toFixed(6);

/**
 * Menejer: restoran sozlamalari - nom, logotip (chekda), telefon, QR domeni, xizmat haqi foizi,
 * davomat joylashuvi va radiusi, Telegram ogohlantirishlari.
 */
export default function SettingsScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const hand = useHand();
  const { busy, error, info, setError, setInfo, run } = useManage();
  const [saved, setSaved] = useState<RestaurantSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const load = useCallback(async () => {
    const s = await pos.api.settings.get();
    setSaved(s);
    setForm(toForm(s));
  }, []);

  useEffect(() => {
    if (isManager) void run(async () => undefined, undefined, load);
  }, [isManager, load, run]);

  async function useMyLocation() {
    if (!form) return;
    setError(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return setError("Joylashuvga ruxsat berilmadi. Telefon sozlamalaridan ruxsat bering yoki koordinatani qo'lda kiriting.");
    try {
      const pos_ = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setForm({ ...form, latitude: coord(pos_.coords.latitude), longitude: coord(pos_.coords.longitude) });
      setInfo("Hozirgi joylashuv qo'yildi. Restoran ichida turib bosganingizga ishonch hosil qiling va saqlang.");
    } catch {
      setError("Joylashuvni aniqlab bo'lmadi. GPS yoqilganini tekshiring.");
    }
  }

  async function save() {
    if (!form) return;
    const phone = form.phone.trim() ? normalizePhone(form.phone) : '';
    const rate = parseOptionalDecimal(form.serviceRate, '0');
    const radius = Number(form.radius);
    const lat = form.latitude.trim() ? parseDecimalInput(form.latitude.replace('-', ''), 6) : null;
    const lon = form.longitude.trim() ? parseDecimalInput(form.longitude.replace('-', ''), 6) : null;
    if (!form.name.trim()) return setError('Restoran nomini kiriting.');
    if (phone === null) return setError("Telefon raqami noto'g'ri (masalan 90 123 45 67).");
    if (rate === null || Number(rate) > 100) return setError("Xizmat haqi 0–100% oralig'ida bo'lsin.");
    if (!Number.isInteger(radius) || radius < 10) return setError("Radius kamida 10 metr bo'lsin.");
    if ((form.latitude.trim() && lat === null) || (form.longitude.trim() && lon === null)) return setError("Koordinata noto'g'ri (masalan 41.311081).");
    if (Boolean(form.latitude.trim()) !== Boolean(form.longitude.trim())) return setError("Kenglik va uzunlikni birga kiriting.");
    await run(
      () =>
        pos.api.settings.update(
          {
            name: form.name.trim(),
            phone,
            public_domain: form.publicDomain.trim(),
            service_charge_rate: rate,
            restore_stock_on_cancel: form.restoreStock,
            latitude: form.latitude.trim() ? form.latitude.trim() : null,
            longitude: form.longitude.trim() ? form.longitude.trim() : null,
            attendance_radius: radius,
            telegram_bot_token: form.botToken.trim(),
            telegram_chat_id: form.chatId.trim(),
          },
          form.logo,
        ),
      'Saqlandi.',
      load,
    );
  }

  async function testTelegram() {
    if (!form) return;
    setError(null);
    await run(
      async () => {
        const res = await pos.api.settings.testTelegram({ telegram_bot_token: form.botToken.trim(), telegram_chat_id: form.chatId.trim() });
        setInfo(res.status ?? 'Test xabari yuborildi.');
      },
    );
  }

  return (
    <Screen onRefresh={() => void run(async () => undefined, undefined, load)}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Boshqaruv</Eyebrow>
          <Title size={44}>Sozlamalar</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      {info && <Muted>{info}</Muted>}
      {isManager && !form && !error && <Muted>Yuklanmoqda...</Muted>}

      {form && (
        <>
          <FormCard title="Restoran">
            <Field label="Nomi" value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoCapitalize="words" />
            <ImageField label="Logotip (chekda chiqadi)" current={saved?.logo} picked={form.logo} original onPick={(logo) => setForm({ ...form, logo })} />
            <Field label="Telefon (chek pastida)" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" placeholder="90 123 45 67" />
            <Field
              label="QR domeni (mijozlar stol QR'ini skanerlaganda ochiladi)"
              value={form.publicDomain}
              onChangeText={(publicDomain) => setForm({ ...form, publicDomain })}
              placeholder="filial1.hamrohpos.uz"
              keyboardType="url"
            />
            <Field label="Xizmat haqi (%)" value={form.serviceRate} onChangeText={(serviceRate) => setForm({ ...form, serviceRate })} keyboardType="decimal-pad" />
          </FormCard>

          <FormCard title="Ombor qoidasi">
            <SwitchRow
              label="Bekor qilinganda qoldiqni qaytarish"
              hint="Yoqilsa, bekor qilingan buyurtma uchun oshxonaga yuborilgan taomlarning ingredientlari omborga qaytariladi. O'chiq bo'lsa qaytarilmaydi (taom tayyorlangan bo'lishi mumkin)."
              value={form.restoreStock}
              onChange={(restoreStock) => setForm({ ...form, restoreStock })}
            />
          </FormCard>

          <FormCard title="Davomat joylashuvi">
            <Muted>Xodimlar kelganda/ketganda shu nuqta atrofidagi radiusda bo'lishi shart.</Muted>
            <Field label="Kenglik (latitude)" value={form.latitude} onChangeText={(latitude) => setForm({ ...form, latitude })} keyboardType="numbers-and-punctuation" />
            <Field label="Uzunlik (longitude)" value={form.longitude} onChangeText={(longitude) => setForm({ ...form, longitude })} keyboardType="numbers-and-punctuation" />
            <Button title="Hozirgi joylashuvni qo'yish" variant="ghost" compact onPress={() => void useMyLocation()} />
            <Field label="Radius (metr)" value={form.radius} onChangeText={(radius) => setForm({ ...form, radius: radius.replace(/\D/g, '') })} keyboardType="number-pad" />
          </FormCard>

          <FormCard title="Telegram ogohlantirishlari">
            <Muted>Qarz (nasiya) harakatlari haqida xabar yuboriladi. Bot tokenini BotFather'dan oling.</Muted>
            <Field label="Bot tokeni" value={form.botToken} onChangeText={(botToken) => setForm({ ...form, botToken })} secureTextEntry />
            <Field label="Chat ID (guruh yoki shaxsiy)" value={form.chatId} onChangeText={(chatId) => setForm({ ...form, chatId })} keyboardType="numbers-and-punctuation" />
            <Button title="Test xabar yuborish" variant="ghost" compact disabled={busy || !form.botToken || !form.chatId} onPress={() => void testTelegram()} />
          </FormCard>

          <Button title="Saqlash" loading={busy} onPress={() => void save()} />
        </>
      )}
    </Screen>
  );
}
