import {
  addProduct,
  addTemplate,
  decreaseProduct,
  describeError,
  emptyCart,
  GUEST_PRESETS,
  setLineNote,
  productCounts,
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
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Screen, Title, Txt } from '@/ui/kit';
import { CartSheet, Chip, ConfirmOrderSheet, MenuPicker, TemplateBar } from '@/ui/parts';
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
  const [metaOpen, setMetaOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => productCounts(cart), [cart]);
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
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      footer={
        <CartSheet
          cart={cart}
          onQty={(l, q) => setCart((c) => setQuantity(c, l.productId, l.note, q))}
          onNote={(l, note) => setCart((c) => setLineNote(c, l.productId, l.note, note))}
        >
          {error && <ErrorText>{error}</ErrorText>}
          <Button
            title={progress.current.orderId ? 'Qayta urinish' : 'Ko\u2018rib chiqish va yuborish'}
            onPress={() => (progress.current.orderId ? void send() : setConfirming(true))}
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
      <ConfirmOrderSheet
        visible={confirming}
        title="Buyurtmani tasdiqlang"
        subtitle={[table?.name, Number(guests) > 0 ? `${guests} mehmon` : '', note.trim()].filter(Boolean).join(' · ')}
        cart={cart}
        busy={busy}
        error={error}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      />
      {registerClosed && <ErrorText>Kassa yopiq — buyurtma ochib bo'lmaydi.</ErrorText>}
      {!data && <Muted>Yuklanmoqda...</Muted>}

      {data && !metaOpen && (
        <Button
          title={
            Number(guests) > 0 || note.trim()
              ? ['Mehmon: ' + (Number(guests) > 0 ? guests : '-'), note.trim() ? 'izoh bor' : ''].filter(Boolean).join(' · ') + '  (o‘zgartirish)'
              : '+ Mehmonlar soni / izoh (ixtiyoriy)'
          }
          variant="ghost"
          compact
          onPress={() => setMetaOpen(true)}
        />
      )}

      {data && metaOpen && (
        <Card>
          <Txt size={14} weight={500} tone="muted">
            Mehmonlar soni (ixtiyoriy)
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GUEST_PRESETS.map((n) => (
              <Chip key={n} label={String(n)} active={guests === String(n)} onPress={() => setGuests(guests === String(n) ? '' : String(n))} />
            ))}
          </View>
          <Field label="Boshqa son" value={guests} onChangeText={(v) => setGuests(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
          <Field label="Buyurtmaga izoh (ixtiyoriy)" value={note} onChangeText={setNote} autoCapitalize="sentences" />
          <Button title="Tayyor" compact onPress={() => setMetaOpen(false)} />
        </Card>
      )}

      {data && (
        <TemplateBar
          templates={data.order_templates ?? []}
          products={data.products}
          onPick={(t) => {
            const r = addTemplate(cart, t, data.products);
            setCart(r.cart);
            return r;
          }}
        />
      )}

      {data && (
        <MenuPicker
          categories={data.categories}
          products={data.products}
          counts={counts}
          onPick={(p) => setCart((c) => addProduct(c, p))}
          onDecrease={(p) => setCart((c) => decreaseProduct(c, p.id))}
        />
      )}
    </Screen>
  );
}
