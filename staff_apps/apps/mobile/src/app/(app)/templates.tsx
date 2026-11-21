import {
  addProduct,
  decreaseProduct,
  emptyCart,
  productCounts,
  setLineNote,
  setQuantity,
  type Cart,
  type OrderTemplate,
} from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useBootstrap, useRealtimeRefresh, useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { FormCard, SwitchRow } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { CartSheet, MenuPicker } from '@/ui/parts';
import { useHand } from '@/ui/theme';

interface Draft {
  id?: number;
  name: string;
  active: boolean;
  sortOrder: number;
  items: Cart;
}

/**
 * Buyurtma shablonlari (menejer): "Osh + salat + choy" kabi ko'p takrorlanadigan to'plamlar. Ofitsiant bir bosishda
 * shablonni qoralamaga qo'shadi, keyin o'zgartiradi. Taomlar savat bilan bir xil usulda tanlanadi (menyu + miqdor + izoh).
 */
export default function TemplatesScreen() {
  const { user } = useSession();
  const allowed = user?.role === 'manager';
  const hand = useHand();
  const { data: boot } = useBootstrap();
  const { busy, error, setError, run } = useManage();
  const [list, setList] = useState<OrderTemplate[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => setList(await pos.api.templates.list()), []);
  useRealtimeRefresh(['menu_changed'], load);
  useEffect(() => {
    if (allowed) void run(async () => undefined, undefined, load);
  }, [allowed, load, run]);

  const products = useMemo(() => new Map((boot?.products ?? []).map((p) => [p.id, p] as const)), [boot]);
  const counts = useMemo(() => productCounts(draft?.items ?? emptyCart), [draft]);

  /** Server qatorlarini savatga aylantiradi (nomi/narxi menyudan; menyuda yo'q taom - "#id" bilan saqlanib qoladi). */
  function toCart(t: OrderTemplate): Cart {
    return t.items.map((i) => {
      const p = products.get(i.product_id);
      return { productId: i.product_id, name: p?.name ?? `Taom #${i.product_id}`, unitPrice: p?.price ?? '0', quantity: i.quantity, note: i.note };
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError('Shablon nomini kiriting.');
    if (draft.items.length === 0) return setError("Kamida bitta taom qo'shing.");
    const body = {
      name: draft.name.trim(),
      is_active: draft.active,
      sort_order: draft.sortOrder,
      items: draft.items.map((l) => ({ product_id: l.productId, quantity: l.quantity, note: l.note })),
    };
    const ok = await run(() => (draft.id ? pos.api.templates.update(draft.id, body) : pos.api.templates.create(body)), undefined, load);
    if (ok) setDraft(null);
  }

  function confirmDelete(t: OrderTemplate) {
    Alert.alert('Shablonni o‘chirish', `"${t.name}" o'chiriladi. Buyurtmalarga ta'sir qilmaydi.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.templates.delete(t.id), undefined, load) },
    ]);
  }

  const summary = (t: OrderTemplate) =>
    t.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${products.get(i.product_id)?.name ?? `#${i.product_id}`}${i.note ? ` (${i.note})` : ''}`).join(' · ');

  return (
    <Screen
      onRefresh={draft ? undefined : () => void run(async () => undefined, undefined, load)}
      footer={
        draft ? (
          <CartSheet
            cart={draft.items}
            onQty={(l, q) => setDraft((d) => d && { ...d, items: setQuantity(d.items, l.productId, l.note, q) })}
            onNote={(l, note) => setDraft((d) => d && { ...d, items: setLineNote(d.items, l.productId, l.note, note) })}
          >
            {error && <ErrorText>{error}</ErrorText>}
            <Button title="Shablonni saqlash" loading={busy} disabled={draft.items.length === 0} onPress={() => void save()} />
          </CartSheet>
        ) : undefined
      }
    >
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Menejer</Eyebrow>
          <Title size={44}>Shablonlar</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => (draft ? setDraft(null) : router.back())} />
      </View>

      {!allowed && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {!draft && error && <ErrorText>{error}</ErrorText>}

      {allowed && !draft && (
        <>
          <Muted>Ko'p takrorlanadigan buyurtmani bir bosishda qoralamaga tushirish uchun: masalan "Osh + salat + choy".</Muted>
          <Button
            title="+ Yangi shablon"
            onPress={() => {
              setError(null);
              setDraft({ name: '', active: true, sortOrder: (list?.reduce((m, t) => Math.max(m, t.sort_order), 0) ?? 0) + 1, items: emptyCart });
            }}
          />
        </>
      )}

      {draft && (
        <>
          <FormCard title={draft.id ? 'Shablonni tahrirlash' : 'Yangi shablon'}>
            <Field label="Nomi (masalan: Standart tushlik)" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} autoCapitalize="sentences" maxLength={100} />
            {draft.id && <SwitchRow label="Faol (ofitsiantlarda ko'rinadi)" value={draft.active} onChange={(active) => setDraft({ ...draft, active })} />}
            <Muted>
              {draft.items.length === 0 ? "Pastdagi menyudan taomlarni tanlang." : "Tanlangan taomlar pastdagi savatda: miqdor va izohni o'zgartirish mumkin."}
            </Muted>
          </FormCard>
          {boot && (
            <MenuPicker
              categories={boot.categories}
              products={boot.products}
              counts={counts}
              onPick={(p) => setDraft((d) => d && { ...d, items: addProduct(d.items, p) })}
              onDecrease={(p) => setDraft((d) => d && { ...d, items: decreaseProduct(d.items, p.id) })}
            />
          )}
        </>
      )}

      {allowed && !draft && list === null && !error && <Muted>Yuklanmoqda...</Muted>}
      {!draft && list?.length === 0 && <Muted>Hali shablon yo'q.</Muted>}
      {!draft &&
        list?.map((t) => (
          <Card key={t.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt size={18} weight={600} style={{ flex: 1 }}>
                {t.name}
              </Txt>
              {!t.is_active && <Pill label="Faol emas" />}
            </View>
            <Muted>{summary(t)}</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button
                title="Tahrirlash"
                variant="ghost"
                compact
                disabled={busy || !boot}
                onPress={() => {
                  setError(null);
                  setDraft({ id: t.id, name: t.name, active: t.is_active, sortOrder: t.sort_order, items: toCart(t) });
                }}
              />
              <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDelete(t)} />
            </View>
          </Card>
        ))}
    </Screen>
  );
}
