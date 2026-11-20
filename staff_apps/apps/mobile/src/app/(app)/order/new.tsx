import {
  addProduct,
  describeError,
  emptyCart,
  setQuantity,
  submitDraft,
  type Cart,
  type SubmitProgress,
} from '@pos/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useBootstrap } from '@/lib/hooks';
import { newUuid, pos } from '@/lib/pos';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Screen, Title } from '@/ui/kit';
import { CartSheet, MenuPicker } from '@/ui/parts';
import { useHand } from '@/ui/theme';

/**
 * Bo'sh stolga yangi buyurtma. Savat serverga FAQAT "Oshxonaga yuborish"da boradi - orqaga
 * qaytilsa stol band bo'lib qolmaydi (buyurtmani ofitsiant bekor qila olmaydi, bu menejer huquqi).
 */
export default function NewOrderScreen() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const { data, refresh } = useBootstrap();
  const hand = useHand();
  const table = data?.tables.find((t) => t.id === Number(tableId));

  const [cart, setCart] = useState<Cart>(emptyCart);
  // sync_uuid qoralama ochilganda bir marta yaratiladi: tarmoq uzilib qayta urinilsa dublikat buyurtma ochilmaydi.
  const [syncUuid] = useState(() => newUuid());
  const progress = useRef<SubmitProgress>({});
  const [guests, setGuests] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => new Map(cart.map((l) => [l.productId, l.quantity] as const)), [cart]);
  const registerClosed = data ? !data.register_open : false;

  async function send() {
    if (busy || cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const id = await submitDraft(pos.api, { syncUuid, tableId: Number(tableId), lines: cart, guestCount: Number(guests) > 0 ? Number(guests) : undefined, note: note.trim() || undefined }, progress.current);
      await refresh();
      router.replace({ pathname: '/order/[id]', params: { id: String(id) } });
    } catch (e) {
      // progress saqlanib qoladi: "Qayta urinish" faqat bajarilmagan qadamlarni takrorlaydi.
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      footer={
        <CartSheet cart={cart} onQty={(l, q) => setCart((c) => setQuantity(c, l.productId, l.note, q))}>
          {error && <ErrorText>{error}</ErrorText>}
          <Button
            title={progress.current.orderId ? 'Qayta urinish' : 'Oshxonaga yuborish'}
            onPress={() => void send()}
            loading={busy}
            disabled={cart.length === 0 || registerClosed}
          />
        </CartSheet>
      }
    >
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Yangi buyurtma</Eyebrow>
          <Title size={52}>{table ? table.name : '...'}</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>
      {registerClosed && <ErrorText>Kassa yopiq — buyurtma ochib bo'lmaydi.</ErrorText>}
      {!data && <Muted>Yuklanmoqda...</Muted>}

      {data && (
        <Card>
          <Field label="Mehmonlar soni (ixtiyoriy)" value={guests} onChangeText={(v) => setGuests(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
          <Field label="Buyurtmaga izoh (ixtiyoriy)" value={note} onChangeText={setNote} autoCapitalize="sentences" />
        </Card>
      )}

      {data && (
        <MenuPicker
          categories={data.categories}
          products={data.products}
          counts={counts}
          onPick={(p) => setCart((c) => addProduct(c, p))}
          onDecrease={(p) => setCart((c) => setQuantity(c, p.id, '', (counts.get(p.id) ?? 0) - 1))}
        />
      )}
    </Screen>
  );
}
