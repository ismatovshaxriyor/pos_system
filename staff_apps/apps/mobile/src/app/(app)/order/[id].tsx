import {
  addProduct,
  addTemplate,
  decreaseProduct,
  cartCount,
  describeError,
  elapsedLabel,
  emptyCart,
  formatMoney,
  parseDecimalInput,
  setLineNote,
  productCounts,
  setQuantity,
  toTiyin,
  type Cart,
  type Order,
  type OrderStatus,
} from '@pos/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useBootstrap, useRealtimeRefresh, useSession } from '@/lib/hooks';
import { pos } from '@/lib/pos';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { useNotify } from '@/ui/toast';
import { CartSheet, ConfirmOrderSheet, MenuPicker, TemplateBar, TotalRow } from '@/ui/parts';
import { useHand } from '@/ui/theme';

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Yangi',
  in_progress: 'Jarayonda',
  completed: 'Yopilgan',
  cancelled: 'Bekor qilingan',
};
const REFRESH_EVENTS = ['order_updated'] as const;

/** Mavjud buyurtma: tarkibi, jami, mahsulot qo'shish. To'lovni kassir qabul qiladi. */
export default function OrderScreen() {
  const hand = useHand();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { user } = useSession();
  const { data: boot, refresh: refreshBoot } = useBootstrap();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  // Qo'shiladigan taomlar savatda yig'iladi va BIR martada yuboriladi: har "+" bosilganda alohida
  // so'rov va oshxonaga alohida chek ketmasin.
  const [cart, setCart] = useState<Cart>(emptyCart);
  const counts = useMemo(() => productCounts(cart), [cart]);
  const [info, setInfo] = useState<string | null>(null);
  useNotify(error, info);
  const [discount, setDiscount] = useState<{ amount: string; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await pos.api.orders.get(orderId));
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefresh(REFRESH_EVENTS, load);

  const finished = order?.status === 'completed' || order?.status === 'cancelled';

  /** Savatdagi taomlarni buyurtmaga qo'shadi (server oshxonaga chekni o'zi chiqaradi). Xatoda savat saqlanadi. */
  async function sendCart() {
    if (adding || cart.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      await pos.api.orders.addItem(
        orderId,
        cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, note: l.note })),
      );
      setCart(emptyCart);
      setShowMenu(false);
      setConfirming(false);
      await load();
    } catch (e) {
      setError(describeError(e));
      setConfirming(false);
    } finally {
      setAdding(false);
    }
  }

  async function start() {
    try {
      await pos.api.orders.start(orderId);
      await load();
      await refreshBoot();
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function printBill(kind: 'printPreBill' | 'printReceipt') {
    setInfo(null);
    setError(null);
    try {
      await pos.api.orders[kind](orderId);
      setInfo(kind === 'printPreBill' ? 'Hisob-chek printerga yuborildi.' : "To'lov cheki printerga yuborildi.");
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function saveDiscount() {
    if (!discount) return;
    const amount = parseDecimalInput(discount.amount || '0');
    if (amount === null) return setError("Chegirma summasini to'g'ri kiriting.");
    setSaving(true);
    setError(null);
    try {
      await pos.api.orders.setDiscount(orderId, { discount_amount: amount, discount_reason: discount.reason.trim() });
      setDiscount(null);
      await load();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmCancel() {
    Alert.alert('Buyurtmani bekor qilish', "Haqiqatan ham bekor qilasizmi? Bu amalni qaytarib bo'lmaydi.", [
      { text: "Yo'q", style: 'cancel' },
      {
        text: 'Bekor qilish',
        style: 'destructive',
        onPress: async () => {
          try {
            await pos.api.orders.cancel(orderId);
            await refreshBoot();
            router.back();
          } catch (e) {
            setError(describeError(e));
          }
        },
      },
    ]);
  }

  const activeItems = order?.items.filter((i) => !i.is_voided) ?? [];
  const due = order ? toTiyin(order.balance_due) : 0;

  return (
    <Screen
      footer={
        showMenu && !finished && cart.length > 0 ? (
          <CartSheet
            cart={cart}
            onQty={(l, q) => setCart((c) => setQuantity(c, l.productId, l.note, q))}
            onNote={(l, note) => setCart((c) => setLineNote(c, l.productId, l.note, note))}
          >
            <Button title={`Ko\u2018rib chiqish va qo\u2018shish (${cartCount(cart)} ta)`} onPress={() => setConfirming(true)} />
          </CartSheet>
        ) : undefined
      }
    >
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>
            {order ? [order.waiter?.first_name, elapsedLabel(order.created_at, Date.now())].filter(Boolean).join(' · ') : 'Buyurtma'}
          </Eyebrow>
          <Title size={52}>{order?.table?.name ?? `#${orderId}`}</Title>
        </View>
        <Button title="← Stollar" variant="ghost" compact onPress={() => router.back()} />
      </View>
      <ConfirmOrderSheet
        visible={confirming}
        title="Qo'shishni tasdiqlang"
        subtitle={order?.table?.name}
        cart={cart}
        busy={adding}
        error={error}
        confirmLabel="Tasdiqlash va oshxonaga qo'shish"
        onConfirm={() => void sendCart()}
        onCancel={() => setConfirming(false)}
      />
      {order && <Pill label={STATUS_LABEL[order.status]} kind={order.status === 'completed' ? 'ok' : 'neutral'} />}
      {order && (order.guest_count > 0 || order.note) && (
        <Muted>{[order.guest_count > 0 ? `${order.guest_count} mehmon` : '', order.note].filter(Boolean).join(' · ')}</Muted>
      )}

      {order && (
        <Card>
          {activeItems.length === 0 && <Muted>Hali mahsulot yo'q.</Muted>}
          {activeItems.map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <Txt size={16} weight={500} style={{ flex: 1 }}>
                <Txt family="mono" size={15} tone="muted">
                  {i.quantity}×{' '}
                </Txt>
                {i.product.name}
                {i.note ? ` (${i.note})` : ''}
              </Txt>
              <Txt family="mono" size={15} tone="muted">
                {formatMoney(i.price)}
              </Txt>
            </View>
          ))}
          <TotalRow label="Mahsulotlar" value={formatMoney(order.total_amount)} />
          {toTiyin(order.discount_amount) > 0 && <TotalRow label="Chegirma" value={`− ${formatMoney(order.discount_amount)}`} />}
          {toTiyin(order.service_charge) > 0 && <TotalRow label="Xizmat haqi" value={formatMoney(order.service_charge)} />}
          <TotalRow label="Jami" value={formatMoney(order.final_amount)} strong />
          {toTiyin(order.amount_paid) > 0 && <TotalRow label="To'langan" value={formatMoney(order.amount_paid)} />}
          {toTiyin(order.amount_paid) > 0 && due > 0 && <TotalRow label="Qolgan" value={formatMoney(order.balance_due)} strong />}
        </Card>
      )}

      {order?.status === 'new' && (
        <Button
          title="Oshxonaga yuborish"
          onPress={() =>
            Alert.alert('Oshxonaga yuborish', 'Buyurtma tasdiqlansa, oshxonaga chek chiqadi. Davom etasizmi?', [
              { text: 'Yo\u2018q', style: 'cancel' },
              { text: 'Tasdiqlash', onPress: () => void start() },
            ])
          }
        />
      )}

      {order && !finished && (
        <Button title={showMenu ? 'Menyuni yopish' : "Mahsulot qo'shish"} variant="ghost" onPress={() => setShowMenu((v) => !v)} />
      )}
      {showMenu && boot && !finished && (
        <>
          <TemplateBar
            templates={boot.order_templates ?? []}
            products={boot.products}
            onPick={(t) => {
              const r = addTemplate(cart, t, boot.products);
              setCart(r.cart);
              return r;
            }}
          />
          <MenuPicker
            categories={boot.categories}
            products={boot.products}
            counts={counts}
            onPick={(p) => setCart((c) => addProduct(c, p))}
            onDecrease={(p) => setCart((c) => decreaseProduct(c, p.id))}
          />
        </>
      )}

      {order && order.status !== 'new' && order.status !== 'cancelled' && (
        <Button title={finished ? "To'lov chekini chiqarish" : 'Hisob-chekni chiqarish'} variant="ghost" onPress={() => void printBill(finished ? 'printReceipt' : 'printPreBill')} />
      )}

      {order && !finished && user?.role === 'manager' && (
        <>
          {!discount && (
            <Button
              title={toTiyin(order.discount_amount) > 0 ? "Chegirmani o'zgartirish" : 'Chegirma qo\u2018yish'}
              variant="ghost"
              onPress={() => setDiscount({ amount: toTiyin(order.discount_amount) > 0 ? String(Number(order.discount_amount)) : '', reason: order.discount_reason })}
            />
          )}
          {discount && (
            <Card>
              <Field label="Chegirma summasi (so'm; 0 - olib tashlash)" value={discount.amount} onChangeText={(amount) => setDiscount({ ...discount, amount })} keyboardType="decimal-pad" />
              <Field label="Sababi" value={discount.reason} onChangeText={(reason) => setDiscount({ ...discount, reason })} autoCapitalize="sentences" />
              <Button title="Saqlash" loading={saving} onPress={() => void saveDiscount()} />
              <Button title="Bekor qilish" variant="ghost" disabled={saving} onPress={() => setDiscount(null)} />
            </Card>
          )}
        </>
      )}

      {order && !finished && user?.role === 'manager' && <Button title="Buyurtmani bekor qilish" variant="danger" onPress={confirmCancel} />}
    </Screen>
  );
}
