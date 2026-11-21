import { formatMoney, MOVEMENT_LABEL, trimDecimal, type Ingredient, type Purchase, type StockMovement, type StockMovementType } from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRealtimeRefresh, useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { ChipSelect } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Muted, Pill, Screen, Segmented, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

type Tab = 'purchases' | 'movements';

function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Ombor tarixi: kirim hujjatlari (kassir/menejer) va harakatlar daftari (faqat menejer). */
export default function StockScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const allowed = isManager || user?.role === 'cashier';
  const hand = useHand();
  const { busy, error, run } = useManage();
  const [tab, setTab] = useState<Tab>('purchases');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchasesNext, setPurchasesNext] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsNext, setMovementsNext] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientId, setIngredientId] = useState<number | null>(null);
  const [type, setType] = useState<StockMovementType | null>(null);

  const loadPurchases = useCallback(async (reset: boolean, page: number) => {
    const res = await pos.api.inventory.purchases({ page });
    setPurchases((prev) => (reset ? res.results : [...prev, ...res.results]));
    setPurchasesNext(Boolean(res.next));
  }, []);

  const loadMovements = useCallback(
    async (reset: boolean, page: number) => {
      const res = await pos.api.inventory.movements({ page, ingredient: ingredientId ?? undefined, movement_type: type ?? undefined });
      setMovements((prev) => (reset ? res.results : [...prev, ...res.results]));
      setMovementsNext(Boolean(res.next));
    },
    [ingredientId, type],
  );

  const reloadCurrent = useCallback(() => {
    if (tab === 'purchases') void loadPurchases(true, 1).catch(() => undefined);
    else void loadMovements(true, 1).catch(() => undefined);
  }, [tab, loadPurchases, loadMovements]);
  useRealtimeRefresh(['inventory_changed'], reloadCurrent);

  useEffect(() => {
    if (!allowed) return;
    if (tab === 'purchases') void run(async () => undefined, undefined, () => loadPurchases(true, 1));
  }, [allowed, tab, loadPurchases, run]);

  useEffect(() => {
    if (!isManager || tab !== 'movements') return;
    void run(async () => undefined, undefined, async () => {
      if (ingredients.length === 0) setIngredients(await pos.api.inventory.ingredients());
      await loadMovements(true, 1);
    });
    // ingredients.length ataylab dependency emas: faqat bir marta yuklanadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, tab, loadMovements, run]);

  return (
    <Screen>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Ombor</Eyebrow>
          <Title size={48}>Tarix</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!allowed && <ErrorText>Bu bo'lim faqat menejer va kassir uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}

      {allowed && (
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'purchases', label: 'Kirimlar' },
            ...(isManager ? [{ value: 'movements' as Tab, label: 'Harakatlar' }] : []),
          ]}
        />
      )}

      {tab === 'purchases' && (
        <>
          {purchases.length === 0 && !busy && <Muted>Hali kirim yo'q.</Muted>}
          {purchases.map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={17} weight={600}>
                  {p.supplier?.name ?? "Ta'minotchi ko'rsatilmagan"}
                </Txt>
                <Txt size={17} weight={600}>
                  {formatMoney(p.total_cost)}
                </Txt>
              </View>
              <Muted>{stamp(p.created_at)}</Muted>
              {p.items.map((it) => (
                <Muted key={it.id}>
                  {it.ingredient.name}: {trimDecimal(it.quantity)} {it.ingredient.unit} × {formatMoney(it.unit_cost)}
                </Muted>
              ))}
              {p.note ? <Muted>Izoh: {p.note}</Muted> : null}
            </Card>
          ))}
          {purchasesNext && <Button title="Yana yuklash" variant="ghost" loading={busy} onPress={() => void run(async () => undefined, undefined, () => loadPurchases(false, Math.floor(purchases.length / 50) + 1))} />}
        </>
      )}

      {tab === 'movements' && isManager && (
        <>
          <ChipSelect
            label="Ingredient"
            value={ingredientId}
            options={[{ value: null as number | null, label: 'Hammasi' }, ...ingredients.map((i) => ({ value: i.id as number | null, label: i.name }))]}
            onChange={setIngredientId}
          />
          <ChipSelect
            label="Turi"
            value={type}
            options={[{ value: null as StockMovementType | null, label: 'Hammasi' }, ...(Object.keys(MOVEMENT_LABEL) as StockMovementType[]).map((t) => ({ value: t as StockMovementType | null, label: MOVEMENT_LABEL[t] }))]}
            onChange={setType}
          />
          {movements.length === 0 && !busy && <Muted>Harakat topilmadi.</Muted>}
          {movements.map((m) => {
            const q = Number(m.quantity);
            return (
              <Card key={m.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Txt size={16} weight={600} style={{ flex: 1 }}>
                    {m.ingredient_name}
                  </Txt>
                  <Pill label={`${q > 0 ? '+' : ''}${trimDecimal(m.quantity)}`} kind={q >= 0 ? 'ok' : 'warn'} />
                </View>
                <Muted>
                  {MOVEMENT_LABEL[m.movement_type]} · {stamp(m.created_at)}
                  {m.created_by ? ` · ${m.created_by.first_name}` : ''}
                </Muted>
                {m.note ? <Muted>{m.note}</Muted> : null}
              </Card>
            );
          })}
          {movementsNext && <Button title="Yana yuklash" variant="ghost" loading={busy} onPress={() => void run(async () => undefined, undefined, () => loadMovements(false, Math.floor(movements.length / 50) + 1))} />}
        </>
      )}
    </Screen>
  );
}
