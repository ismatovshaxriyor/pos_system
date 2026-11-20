import { formatMoney, parseDecimalInput, trimDecimal, type Ingredient, type Supplier } from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { ChipSelect, FormCard, SectionTitle } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Screen, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

interface Line {
  ingredientId: number | null;
  quantity: string;
  unitCost: string;
}

/**
 * Kirim hujjati: bir nechta ingredient, ta'minotchi va izoh bilan. Saqlanganda zaxira va
 * ingredientning oxirgi narxi (tannarx) darhol yangilanadi.
 */
export default function PurchaseScreen() {
  const { user } = useSession();
  const allowed = user?.role === 'manager' || user?.role === 'cashier';
  const hand = useHand();
  const { busy, error, info, setError, run } = useManage();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ingredientId: null, quantity: '', unitCost: '' }]);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ing, sup] = await Promise.all([pos.api.inventory.ingredients(), pos.api.inventory.suppliers()]);
    setIngredients(ing.filter((i) => i.is_active));
    setSuppliers(sup.filter((s) => s.is_active));
  }, []);

  useEffect(() => {
    if (allowed) void run(async () => undefined, undefined, load);
  }, [allowed, load, run]);

  const patch = (idx: number, p: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...p } : l)));

  const total = lines.reduce((sum, l) => {
    const q = parseDecimalInput(l.quantity, 3);
    const c = parseDecimalInput(l.unitCost);
    return q && c ? sum + Number(q) * Number(c) : sum;
  }, 0);

  async function submit() {
    setError(null);
    setDone(null);
    const items: { ingredient_id: number; quantity: string; unit_cost: string }[] = [];
    for (const [i, l] of lines.entries()) {
      const q = parseDecimalInput(l.quantity, 3);
      const c = parseDecimalInput(l.unitCost);
      if (l.ingredientId === null || q === null || Number(q) <= 0 || c === null) {
        return setError(`${i + 1}-qator: ingredient, miqdor (0 dan katta) va narxni to'g'ri kiriting.`);
      }
      items.push({ ingredient_id: l.ingredientId, quantity: q, unit_cost: c });
    }
    if (new Set(items.map((x) => x.ingredient_id)).size !== items.length) return setError("Bir ingredient ikki marta kiritilgan - birlashtiring.");
    const ok = await run(() => pos.api.inventory.purchase({ supplier_id: supplierId, note: note.trim(), items }), undefined, load);
    if (ok) {
      setDone(`Kirim saqlandi: ${formatMoney(total)}`);
      setLines([{ ingredientId: null, quantity: '', unitCost: '' }]);
      setNote('');
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Ombor</Eyebrow>
          <Title size={48}>Kirim</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!allowed && <ErrorText>Bu bo'lim faqat menejer va kassir uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      {info && <Muted>{info}</Muted>}
      {done && <Muted>{done}</Muted>}

      {allowed && (
        <>
          <ChipSelect
            label="Ta'minotchi"
            value={supplierId}
            options={[{ value: null as number | null, label: "Ko'rsatilmagan" }, ...suppliers.map((s) => ({ value: s.id as number | null, label: s.name }))]}
            onChange={setSupplierId}
          />
          <Field label="Izoh (ixtiyoriy)" value={note} onChangeText={setNote} autoCapitalize="sentences" />

          <SectionTitle>Qatorlar</SectionTitle>
          {lines.map((l, idx) => {
            const ing = ingredients.find((i) => i.id === l.ingredientId);
            return (
              <FormCard key={idx} title={`${idx + 1}-qator${ing ? ` · ${ing.name}` : ''}`}>
                <ChipSelect
                  value={l.ingredientId}
                  options={ingredients
                    .filter((i) => i.id === l.ingredientId || !lines.some((x) => x.ingredientId === i.id))
                    .map((i) => ({ value: i.id as number | null, label: i.name }))}
                  onChange={(ingredientId) => {
                    const chosen = ingredients.find((i) => i.id === ingredientId);
                    // Oxirgi kirim narxini taklif qilamiz (bo'sh bo'lsa).
                    patch(idx, { ingredientId, unitCost: l.unitCost || (chosen && Number(chosen.cost_price) > 0 ? trimDecimal(chosen.cost_price) : '') });
                  }}
                />
                <Field label={`Miqdor${ing ? ` (${ing.unit})` : ''}`} value={l.quantity} onChangeText={(quantity) => patch(idx, { quantity })} keyboardType="decimal-pad" />
                <Field label={`Narxi (so'm${ing ? `, 1 ${ing.unit} uchun` : ''})`} value={l.unitCost} onChangeText={(unitCost) => patch(idx, { unitCost })} keyboardType="decimal-pad" />
                {lines.length > 1 && <Button title="Qatorni olib tashlash" variant="danger" compact onPress={() => setLines((ls) => ls.filter((_, i) => i !== idx))} />}
              </FormCard>
            );
          })}
          <Button title="+ Qator qo'shish" variant="ghost" compact onPress={() => setLines((ls) => [...ls, { ingredientId: null, quantity: '', unitCost: '' }])} />

          <Card>
            <Txt size={14} tone="muted">
              Jami summa
            </Txt>
            <Txt size={28} weight={600}>
              {formatMoney(total)}
            </Txt>
          </Card>
          <Button title="Kirimni saqlash" loading={busy} onPress={() => void submit()} />
        </>
      )}
    </Screen>
  );
}
