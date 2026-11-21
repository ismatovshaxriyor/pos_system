import {
  formatMoney,
  INGREDIENT_UNITS,
  parseDecimalInput,
  parseOptionalDecimal,
  trimDecimal,
  UNIT_LABEL,
  type Ingredient,
  type IngredientUnit,
  type Supplier,
} from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useRealtimeRefresh, useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { ChipSelect, FormCard, SwitchRow } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Segmented, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

type Filter = 'all' | 'low' | 'archived';

type Action =
  | { kind: 'edit'; id?: number; name: string; unit: IngredientUnit; minStock: string; supplierId: number | null; active: boolean }
  | { kind: 'count'; id: number; quantity: string; note: string }
  | { kind: 'waste'; id: number; quantity: string; note: string };

/**
 * Ombor: ingredientlar (nom, birlik, minimal qoldiq, ta'minotchi, faollik), inventarizatsiya (sanash)
 * va yo'qotish (isrof). Zaxira faqat kirim/sanash/yo'qotish orqali o'zgaradi - server har birini daftarga yozadi.
 * Kirim, tarix va ta'minotchilar alohida ekranlarda.
 */
export default function InventoryScreen() {
  const { user } = useSession();
  const allowed = user?.role === 'manager' || user?.role === 'cashier';
  const isManager = user?.role === 'manager';
  const hand = useHand();
  const { busy, error, info, setError, run } = useManage();
  const [items, setItems] = useState<Ingredient[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [list, sup] = await Promise.all([pos.api.inventory.ingredients(), pos.api.inventory.suppliers()]);
    setItems(list);
    setSuppliers(sup.filter((s) => s.is_active));
  }, []);

  useRealtimeRefresh(['inventory_changed', 'low_stock'], load);

  useEffect(() => {
    if (allowed) void run(async () => undefined, undefined, load);
  }, [allowed, load, run]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? [])
      .filter((i) => (filter === 'archived' ? !i.is_active : i.is_active))
      .filter((i) => filter !== 'low' || i.is_low)
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.is_low) - Number(a.is_low) || a.name.localeCompare(b.name));
  }, [items, filter, search]);

  const lowCount = (items ?? []).filter((i) => i.is_active && i.is_low).length;

  async function submit() {
    if (!action) return;
    setError(null);
    let call: (() => Promise<unknown>) | null = null;
    if (action.kind === 'edit') {
      const min = parseOptionalDecimal(action.minStock, '0', 3);
      if (!action.name.trim() || min === null) return setError("Nomi va minimal qoldiqni to'g'ri kiriting.");
      const body = { name: action.name.trim(), unit: action.unit, min_stock: min, supplier_id: action.supplierId, is_active: action.active };
      call = () => (action.id ? pos.api.inventory.updateIngredient(action.id, body) : pos.api.inventory.createIngredient(body));
    } else if (action.kind === 'count') {
      const q = parseDecimalInput(action.quantity, 3);
      if (q === null) return setError("Haqiqiy qoldiqni raqam bilan kiriting (masalan 12.5).");
      call = () => pos.api.inventory.adjust(action.id, { new_quantity: q, note: action.note.trim() || 'Inventarizatsiya' });
    } else {
      const q = parseDecimalInput(action.quantity, 3);
      if (q === null || Number(q) <= 0) return setError("Yo'qotilgan miqdorni (0 dan katta) kiriting.");
      call = () => pos.api.inventory.adjust(action.id, { delta: `-${q}`, note: action.note.trim() || "Yo'qotish (isrof)" });
    }
    const ok = await run(call, undefined, load);
    if (ok) setAction(null);
  }

  function confirmDelete(i: Ingredient) {
    Alert.alert("Ingredientni o'chirish", `"${i.name}" o'chiriladi. Retsept yoki tarixda ishlatilgan bo'lsa server rad etadi - u holda arxivlang.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.inventory.deleteIngredient(i.id), undefined, load) },
    ]);
  }

  return (
    <Screen onRefresh={() => void run(async () => undefined, undefined, load)}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Boshqaruv</Eyebrow>
          <Title size={48}>Ombor</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!allowed && <ErrorText>Bu bo'lim faqat menejer va kassir uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      {info && <Muted>{info}</Muted>}

      {allowed && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button title="Kirim qilish" compact onPress={() => router.push('/purchase')} />
          <Button title="Tarix" variant="ghost" compact onPress={() => router.push('/stock')} />
          <Button title="Ta'minotchilar" variant="ghost" compact onPress={() => router.push('/suppliers')} />
        </View>
      )}

      {allowed && !action && (
        <Button
          title="+ Yangi ingredient"
          variant="ghost"
          onPress={() => setAction({ kind: 'edit', name: '', unit: 'kg', minStock: '', supplierId: null, active: true })}
        />
      )}

      {action?.kind === 'edit' && (
        <FormCard title={action.id ? 'Ingredientni tahrirlash' : 'Yangi ingredient'}>
          <Field label="Nomi" value={action.name} onChangeText={(name) => setAction({ ...action, name })} autoCapitalize="sentences" />
          <ChipSelect
            label="Birlik"
            value={action.unit}
            options={INGREDIENT_UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))}
            onChange={(unit) => setAction({ ...action, unit })}
          />
          <Field
            label={`Minimal qoldiq (${action.unit}) - shundan kamaysa ogohlantiriladi`}
            value={action.minStock}
            onChangeText={(minStock) => setAction({ ...action, minStock })}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <ChipSelect
            label="Asosiy ta'minotchi"
            value={action.supplierId}
            options={[{ value: null as number | null, label: "Yo'q" }, ...suppliers.map((s) => ({ value: s.id as number | null, label: s.name }))]}
            onChange={(supplierId) => setAction({ ...action, supplierId })}
          />
          {action.id && <SwitchRow label="Faol" hint="O'chirilsa arxivga tushadi (ro'yxatda va kirimda ko'rinmaydi)." value={action.active} onChange={(active) => setAction({ ...action, active })} />}
          <Button title="Saqlash" loading={busy} onPress={() => void submit()} />
          <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setAction(null)} />
        </FormCard>
      )}

      {allowed && (
        <>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Hammasi' },
              { value: 'low', label: lowCount ? `Kam (${lowCount})` : 'Kam' },
              { value: 'archived', label: 'Arxiv' },
            ]}
          />
          <Field label="Qidirish" value={search} onChangeText={setSearch} />
        </>
      )}

      {allowed && items === null && !error && <Muted>Yuklanmoqda...</Muted>}
      {items && shown.length === 0 && <Muted>{filter === 'low' ? "Kam qolgan ingredient yo'q." : "Ingredient topilmadi."}</Muted>}

      {shown.map((i) => {
        const open = action && action.kind !== 'edit' && action.id === i.id ? action : null;
        return (
          <Card key={i.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt size={18} weight={600} style={{ flex: 1 }}>
                {i.name}
              </Txt>
              {i.is_low && i.is_active && <Pill label="Kam qoldi" kind="warn" />}
              {!i.is_active && <Pill label="Arxiv" />}
            </View>
            <Muted>
              Qoldiq: {trimDecimal(i.current_stock)} {i.unit} · minimal {trimDecimal(i.min_stock)}
            </Muted>
            <Muted>
              {Number(i.cost_price) > 0 ? `Oxirgi narx: ${formatMoney(i.cost_price)}/${i.unit}` : 'Narx hali yo‘q'}
              {i.supplier ? ` · ${i.supplier.name}` : ''}
            </Muted>

            {open && (
              <>
                <Field
                  label={open.kind === 'count' ? `Haqiqiy qoldiq (${i.unit})` : `Yo'qotilgan miqdor (${i.unit})`}
                  value={open.quantity}
                  onChangeText={(quantity) => setAction({ ...open, quantity })}
                  keyboardType="decimal-pad"
                />
                <Field
                  label={open.kind === 'count' ? 'Izoh (ixtiyoriy)' : 'Sabab (masalan: buzildi, to‘kildi)'}
                  value={open.note}
                  onChangeText={(note) => setAction({ ...open, note })}
                  autoCapitalize="sentences"
                />
                <Button title="Saqlash" loading={busy} onPress={() => void submit()} />
                <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setAction(null)} />
              </>
            )}

            {!open && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {i.is_active && (
                  <>
                    <Button title="Sanash" compact variant="ghost" onPress={() => setAction({ kind: 'count', id: i.id, quantity: trimDecimal(i.current_stock), note: '' })} />
                    <Button title="Yo'qotish" compact variant="ghost" onPress={() => setAction({ kind: 'waste', id: i.id, quantity: '', note: '' })} />
                  </>
                )}
                <Button
                  title="Tahrirlash"
                  compact
                  variant="ghost"
                  onPress={() =>
                    setAction({ kind: 'edit', id: i.id, name: i.name, unit: i.unit, minStock: trimDecimal(i.min_stock), supplierId: i.supplier?.id ?? null, active: i.is_active })
                  }
                />
                {!i.is_active && (
                  <Button title="Qaytarish" compact variant="ghost" disabled={busy} onPress={() => void run(() => pos.api.inventory.updateIngredient(i.id, { is_active: true }), undefined, load)} />
                )}
                {isManager && <Button title="O'chirish" compact variant="danger" disabled={busy} onPress={() => confirmDelete(i)} />}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
