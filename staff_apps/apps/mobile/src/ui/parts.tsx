import {
  cartCount,
  cartTotalTiyin,
  formatMoney,
  MAX_NOTE_LENGTH,
  NOTE_PRESETS,
  tiyinToDecimal,
  toggleNotePart,
  type Cart,
  type Category,
  type Product,
} from '@pos/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, Txt, useLift } from './kit';
import { FONT, useHand, useTheme } from './theme';

/** Filtr chipi: tanlangan = och tus (`sel`) + ink-60 chegara, qora to'ldirish emas. */
export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        minHeight: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: active ? c.ink60 : c.grid,
        backgroundColor: active ? c.sel : c.card,
        justifyContent: 'center',
      }}
    >
      <Txt size={15} weight={600} tone={active ? 'ink' : 'muted'}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Katta (50/50) tugma: ikki qo'l uchun "katta" uslubda. */
function bigBtn(bg: string) {
  return { flex: 1, height: 56, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' } as const;
}

/** −/+ : 48dp nishon, bir qo'lda bosishga qulay. */
export function QtyStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const { c } = useTheme();
  const btn = { width: 48, height: 48, borderRadius: 14, backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Pressable style={btn} onPress={() => onChange(value - 1)} accessibilityLabel="Kamaytirish">
        <Txt size={24} weight={600}>−</Txt>
      </Pressable>
      <Txt family="mono" weight={500} size={18} align="center" style={{ minWidth: 32 }}>
        {value}
      </Txt>
      <Pressable style={btn} onPress={() => onChange(value + 1)} accessibilityLabel="Ko'paytirish">
        <Txt size={24} weight={600}>+</Txt>
      </Pressable>
    </View>
  );
}

/**
 * Menyu: toifa chiplari + qidiruv + mahsulotlar. Har mahsulot satri bosilganda `onPick`.
 * `counts` - savatdagi miqdor (ofitsiant nima qo'shganini darrov ko'rsin).
 * Eslatma: ro'yxat virtualizatsiya qilinmagan - yuzlab mahsulotli menyuda FlatList'ga o'tkazish kerak.
 */
export function MenuPicker({
  categories,
  products,
  onPick,
  onDecrease,
  counts,
}: {
  categories: Category[];
  products: Product[];
  onPick: (p: Product) => void;
  /** Savatdagi miqdorni 1 taga kamaytirish ("−" tugmasi). Berilmasa "−" ko'rsatilmaydi. */
  onDecrease?: (p: Product) => void;
  counts?: ReadonlyMap<number, number>;
}) {
  const { c, scale } = useTheme();
  const hand = useHand();
  const lift = useLift();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) => (categoryId === null || p.category.id === categoryId) && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products, categoryId, query]);

  return (
    <View style={{ gap: 10 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Qidirish..."
        placeholderTextColor={c.ink60}
        autoCorrect={false}
        style={{
          backgroundColor: c.card,
          borderColor: c.grid,
          borderWidth: 1,
          borderRadius: 14,
          color: c.ink,
          fontFamily: FONT.body400,
          fontSize: Math.round(16 * scale),
          paddingHorizontal: 16,
          minHeight: 48,
        }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Hammasi" active={categoryId === null} onPress={() => setCategoryId(null)} />
        {categories.map((cat) => (
          <Chip key={cat.id} label={cat.name} active={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
        ))}
      </ScrollView>
      {visible.length === 0 && <Txt tone="muted">Mahsulot topilmadi.</Txt>}
      {visible.map((p) => {
        const n = counts?.get(p.id) ?? 0;
        const canMinus = !!onDecrease;
        const split = hand.splitStepper && canMinus && n > 0;
        const edgeMinus = hand.edgeMinus && canMinus;
        const info = (
          <View style={{ flex: 1 }}>
            <Txt size={17} weight={500}>
              {p.name}
            </Txt>
            <Txt family="mono" size={14} tone="muted">
              {formatMoney(p.price)}
            </Txt>
          </View>
        );
        const badge = n > 0 && (
          <View style={{ backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <Txt family="mono" weight={500} size={14}>
              {n}×
            </Txt>
          </View>
        );
        const circle = {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: c.panel,
          alignItems: 'center',
          justifyContent: 'center',
        } as const;
        return (
          <View
            key={p.id}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: n > 0 ? c.sel : c.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: n > 0 ? c.ink60 : c.grid,
                paddingHorizontal: 16,
                minHeight: 64,
                gap: 12,
              },
              n === 0 && lift,
              split && { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 10, gap: 8 },
            ]}
          >
            {split ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {info}
                  {badge}
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    accessibilityLabel="Kamaytirish"
                    onPress={() => onDecrease?.(p)}
                    style={({ pressed }) => [bigBtn(c.panel), pressed && { opacity: 0.85 }]}
                  >
                    <Txt size={30} weight={500}>−</Txt>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Ko'paytirish"
                    onPress={() => onPick(p)}
                    style={({ pressed }) => [bigBtn(c.card), { borderWidth: 1, borderColor: c.ink60 }, pressed && { opacity: 0.85 }]}
                  >
                    <Txt size={30} weight={500}>+</Txt>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {edgeMinus && (
                  <Pressable
                    accessibilityLabel="Kamaytirish"
                    disabled={n === 0}
                    onPress={() => onDecrease?.(p)}
                    style={[circle, { opacity: n === 0 ? 0 : 1 }]}
                  >
                    <Txt size={26} weight={500}>−</Txt>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onPick(p)}
                  style={({ pressed }) => [
                    { flex: 1, flexDirection: hand.addDirection, alignItems: 'center', gap: 12, minHeight: 62 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {info}
                  {badge}
                  <View style={circle}>
                    <Txt size={26} weight={500}>+</Txt>
                  </View>
                </Pressable>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <Txt size={strong ? 18 : 15} weight={strong ? 600 : 400} tone={strong ? 'ink' : 'muted'}>
        {label}
      </Txt>
      <Txt family="mono" size={strong ? 20 : 15} weight={strong ? 500 : 400} tone={strong ? 'ink' : 'muted'}>
        {value}
      </Txt>
    </View>
  );
}

/**
 * Pastga mahkamlangan savat: tutqich ("grabber") bosilsa ro'yxat ochiladi/yopiladi.
 * Yopiq holatda ham jami va asosiy tugma doim ko'rinib turadi.
 */
export function CartSheet({
  cart,
  onQty,
  onNote,
  children,
}: {
  cart: Cart;
  onQty: (line: Cart[number], q: number) => void;
  /** Berilsa har qatorda "Izoh" (tezkor tugmalar + yozish) chiqadi. */
  onNote?: (line: Cart[number], note: string) => void;
  /** Asosiy tugma + xato matni */
  children: ReactNode;
}) {
  const { c } = useTheme();
  const hand = useHand();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // Izoh tahrirlanayotgan qator kaliti (`mahsulot|izoh`); izoh o'zgarganda kalit ham o'zgaradi - quyida yangilanadi.
  const [editing, setEditing] = useState<string | null>(null);
  const empty = cart.length === 0;

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderTopWidth: 1,
        borderColor: c.grid,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 12,
        gap: 10,
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -3 },
        elevation: 8,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Savatni yopish' : 'Savatni ochish'}
        onPress={() => !empty && setOpen((v) => !v)}
        style={{ minHeight: 44, justifyContent: 'center', gap: 8 }}
      >
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.edge }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt size={15} weight={500} tone="muted">
            {empty ? 'Savat bo\'sh' : `Savat · ${cartCount(cart)} ta`}
          </Txt>
          <Txt family="mono" weight={500} size={22}>
            {formatMoney(tiyinToDecimal(cartTotalTiyin(cart)))}
          </Txt>
        </View>
      </Pressable>

      {open && !empty && (
        <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 4 }}>
          {cart.map((l) => {
            const key = `${l.productId}|${l.note}`;
            const isEditing = !!onNote && editing === key;
            return (
              <View key={key} style={{ gap: 6, paddingVertical: 4 }}>
                <View style={{ flexDirection: hand.addDirection, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Txt size={16} weight={500}>
                      {l.name}
                    </Txt>
                    <Txt family="mono" size={13} tone="muted">
                      {formatMoney(l.unitPrice)}
                    </Txt>
                    {onNote && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${l.name} uchun izoh`}
                        onPress={() => setEditing(isEditing ? null : key)}
                        style={{ minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }}
                      >
                        <Txt size={14} weight={600} tone={l.note ? 'ink' : 'muted'}>
                          {l.note ? `✎ ${l.note}` : '＋ Izoh'}
                        </Txt>
                      </Pressable>
                    )}
                  </View>
                  <QtyStepper value={l.quantity} onChange={(q) => onQty(l, q)} />
                </View>
                {isEditing && (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {NOTE_PRESETS.map((preset) => {
                        const on = l.note.split(';').some((x) => x.trim().toLowerCase() === preset.toLowerCase());
                        return (
                          <Chip
                            key={preset}
                            label={preset}
                            active={on}
                            onPress={() => {
                              const next = toggleNotePart(l.note, preset);
                              onNote?.(l, next);
                              setEditing(`${l.productId}|${next}`);
                            }}
                          />
                        );
                      })}
                    </View>
                    <NoteInput
                      key={key}
                      initial={l.note}
                      onCommit={(text) => {
                        onNote?.(l, text);
                        setEditing(`${l.productId}|${text.trim().slice(0, MAX_NOTE_LENGTH)}`);
                      }}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {children}
    </View>
  );
}

/**
 * Yuborishdan oldingi yakuniy tasdiq: ofitsiant nima ketayotganini ko'rib chiqadi. Oshxonaga chek FAQAT
 * "Tasdiqlash" bosilgandan keyin ketadi; "Tahrirlash" savatga qaytaradi, hech narsa yuborilmaydi.
 */
export function ConfirmOrderSheet({
  visible,
  title,
  subtitle,
  cart,
  busy,
  error,
  confirmLabel = 'Tasdiqlash va oshxonaga yuborish',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  /** Stol, mehmonlar soni, buyurtma izohi kabi qisqa qator. */
  subtitle?: string;
  cart: Cart;
  busy?: boolean;
  error?: string | null;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {
        if (!busy) onCancel();
      }}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: insets.bottom + 16,
            gap: 12,
            maxHeight: '85%',
          }}
        >
          <View style={{ gap: 2 }}>
            <Txt size={22} weight={600}>
              {title}
            </Txt>
            {subtitle ? (
              <Txt size={14} tone="muted">
                {subtitle}
              </Txt>
            ) : null}
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
            {cart.map((l) => (
              <View key={`${l.productId}|${l.note}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt size={16} weight={500}>
                    <Txt family="mono" size={15} tone="muted">
                      {l.quantity}×{' '}
                    </Txt>
                    {l.name}
                  </Txt>
                  {l.note ? (
                    <Txt size={14} tone="muted">
                      ✎ {l.note}
                    </Txt>
                  ) : null}
                </View>
                <Txt family="mono" size={15} tone="muted">
                  {formatMoney(tiyinToDecimal(cartTotalTiyin([l])))}
                </Txt>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Txt size={15} weight={500} tone="muted">
              Jami · {cartCount(cart)} ta
            </Txt>
            <Txt family="mono" weight={500} size={22}>
              {formatMoney(tiyinToDecimal(cartTotalTiyin(cart)))}
            </Txt>
          </View>
          <Txt size={13} tone="muted">
            Tasdiqlasangiz, buyurtma oshxonaga chek bo'lib chiqadi.
          </Txt>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button title={confirmLabel} onPress={onConfirm} loading={busy} />
          <Button title="Tahrirlash" variant="ghost" disabled={busy} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

/** Erkin izoh: yozib bo'lgach (klaviatura "tayyor" yoki fokus ketganda) saqlanadi - har harfda qator kaliti o'zgarmasin. */
function NoteInput({ initial, onCommit }: { initial: string; onCommit: (text: string) => void }) {
  const { c, scale } = useTheme();
  const [text, setText] = useState(initial);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onEndEditing={() => onCommit(text)}
      onSubmitEditing={() => onCommit(text)}
      placeholder="Boshqa izoh yozing..."
      placeholderTextColor={c.ink60}
      maxLength={MAX_NOTE_LENGTH}
      returnKeyType="done"
      style={{
        backgroundColor: c.panel,
        borderColor: c.grid,
        borderWidth: 1,
        borderRadius: 12,
        color: c.ink,
        fontFamily: FONT.body400,
        fontSize: Math.round(15 * scale),
        paddingHorizontal: 14,
        minHeight: 44,
      }}
    />
  );
}

/** Ma'lumot kartochkasi ichida bo'lim sarlavhasi bilan. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Txt size={14} weight={500} tone="muted">
        {title}
      </Txt>
      {children}
    </Card>
  );
}
