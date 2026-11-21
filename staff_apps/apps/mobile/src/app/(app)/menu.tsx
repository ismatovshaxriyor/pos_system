import {
  formatMoney,
  parseDecimalInput,
  parseOptionalDecimal,
  trimDecimal,
  type Category,
  type ImageUpload,
  type Ingredient,
  type Printer,
  type Product,
  type RecipeItem,
} from '@pos/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useBootstrap, useRealtimeRefresh, useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { ChipSelect, FormCard, ImageField, SectionTitle, SwitchRow } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

interface ProductDraft {
  id?: number;
  name: string;
  price: string;
  categoryId: number | null;
  barcode: string;
  costPrice: string;
  taxRate: string;
  available: boolean;
  image: ImageUpload | null;
  currentImage: string | null;
}

interface CategoryDraft {
  id?: number;
  name: string;
  printerId: number | null;
  image: ImageUpload | null;
  currentImage: string | null;
}

interface RecipeDraft {
  productId: number;
  ingredientId: number | null;
  quantity: string;
}

const emptyProduct = (categoryId: number | null): ProductDraft => ({
  name: '',
  price: '',
  categoryId,
  barcode: '',
  costPrice: '',
  taxRate: '',
  available: true,
  image: null,
  currentImage: null,
});

/**
 * Menejer: to'liq menyu boshqaruvi - mahsulot (nom, narx, bo'lim, shtrix-kod, tannarx, soliq, rasm,
 * mavjudlik), bo'lim (nom, rasm, printer) va retsept (mahsulot nimalardan tayyorlanadi).
 * O'zgarishdan keyin bootstrap yangilanadi - ofitsiantlar yangi menyuni ko'radi.
 */
export default function MenuScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const { data, refresh } = useBootstrap();
  const hand = useHand();
  const { busy, error, info, setError, run } = useManage();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [catDraft, setCatDraft] = useState<CategoryDraft | null>(null);
  const [recipeFor, setRecipeFor] = useState<number | null>(null);
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft | null>(null);

  const categories: Category[] = data?.categories ?? [];

  const load = useCallback(async () => {
    const [p, pr, ing] = await Promise.all([pos.api.menu.products(), pos.api.printers.list(), pos.api.inventory.ingredients()]);
    setProducts(p);
    setPrinters(pr);
    setIngredients(ing.filter((i) => i.is_active));
  }, []);

  useRealtimeRefresh(['menu_changed', 'printers_changed', 'inventory_changed'], load);

  useEffect(() => {
    if (isManager) void run(async () => undefined, undefined, load);
  }, [isManager, load, run]);

  const reload = useCallback(() => Promise.all([load(), refresh()]), [load, refresh]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q));
    return categories
      .map((c) => ({ category: c, items: list.filter((p) => p.category.id === c.id) }))
      .filter((g) => g.items.length > 0);
  }, [products, categories, search]);

  async function saveProduct() {
    if (!draft) return;
    const price = parseDecimalInput(draft.price);
    const cost = parseOptionalDecimal(draft.costPrice, '0');
    const tax = parseOptionalDecimal(draft.taxRate, '0');
    if (!draft.name.trim() || price === null || Number(price) <= 0 || draft.categoryId === null) {
      return setError("Nomi, narxi (so'mda) va bo'limini to'ldiring.");
    }
    if (cost === null || tax === null || Number(tax) > 100) return setError("Tannarx va soliq (0–100%) to'g'ri kiritilsin.");
    const body = {
      name: draft.name.trim(),
      price,
      category_id: draft.categoryId,
      barcode: draft.barcode.trim() || null,
      cost_price: cost,
      tax_rate: tax,
      is_available: draft.available,
    };
    const ok = await run(
      () => (draft.id ? pos.api.menu.updateProduct(draft.id, body, draft.image) : pos.api.menu.createProduct(body, draft.image)),
      undefined,
      reload,
    );
    if (ok) setDraft(null);
  }

  async function saveCategory() {
    if (!catDraft) return;
    const name = catDraft.name.trim();
    if (!name) return setError("Bo'lim nomini kiriting.");
    const body = { name, printer_id: catDraft.printerId };
    const ok = await run(
      () => (catDraft.id ? pos.api.menu.updateCategory(catDraft.id, body, catDraft.image) : pos.api.menu.createCategory(body, catDraft.image)),
      undefined,
      reload,
    );
    if (ok) setCatDraft(null);
  }

  async function openRecipe(p: Product) {
    if (recipeFor === p.id) return setRecipeFor(null);
    setRecipeFor(p.id);
    setRecipeDraft(null);
    setRecipe([]);
    await run(async () => setRecipe(await pos.api.menu.recipe(p.id)));
  }

  async function saveRecipeItem() {
    if (!recipeDraft || recipeFor === null) return;
    const qty = parseDecimalInput(recipeDraft.quantity, 3);
    if (recipeDraft.ingredientId === null || qty === null || Number(qty) <= 0) return setError("Ingredient va miqdorni (0 dan katta) kiriting.");
    const ingredientId = recipeDraft.ingredientId;
    const productId = recipeFor;
    const ok = await run(
      () => pos.api.menu.addRecipeItem({ product_id: productId, ingredient_id: ingredientId, quantity: qty }),
      undefined,
      async () => setRecipe(await pos.api.menu.recipe(productId)),
    );
    if (ok) setRecipeDraft(null);
  }

  function confirmDeleteProduct(p: Product) {
    Alert.alert("Mahsulotni o'chirish", `"${p.name}" menyudan olib tashlanadi. Eski buyurtmalar saqlanib qoladi.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.menu.deleteProduct(p.id), undefined, reload) },
    ]);
  }

  function confirmDeleteCategory(c: Category) {
    Alert.alert("Bo'limni o'chirish", `"${c.name}" bo'limi o'chiriladi.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.menu.deleteCategory(c.id), undefined, reload) },
    ]);
  }

  const margin = (p: Product) => {
    const cost = Number(p.cost_price);
    const price = Number(p.price);
    if (!(cost > 0) || !(price > 0)) return null;
    return `Foyda ${formatMoney(price - cost)} (${Math.round(((price - cost) / price) * 100)}%)`;
  };

  return (
    <Screen onRefresh={() => void run(async () => undefined, undefined, reload)}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Boshqaruv</Eyebrow>
          <Title size={48}>Menyu</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      {info && <Muted>{info}</Muted>}

      {isManager && !draft && (
        <Button title="+ Yangi mahsulot" disabled={categories.length === 0} onPress={() => setDraft(emptyProduct(categories[0]?.id ?? null))} />
      )}
      {isManager && categories.length === 0 && data && <Muted>Avval bo'lim (kategoriya) yaratilishi kerak.</Muted>}

      {draft && (
        <FormCard title={draft.id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}>
          <Field label="Nomi" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} autoCapitalize="sentences" />
          <Field label="Narxi (so'm)" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price })} keyboardType="decimal-pad" placeholder="25000" />
          <ChipSelect
            label="Bo'lim"
            value={draft.categoryId}
            options={categories.map((c) => ({ value: c.id as number | null, label: c.name }))}
            onChange={(categoryId) => setDraft({ ...draft, categoryId })}
          />
          <Field
            label="Tannarx (so'm, ixtiyoriy) - foyda hisobi uchun"
            value={draft.costPrice}
            onChangeText={(costPrice) => setDraft({ ...draft, costPrice })}
            keyboardType="decimal-pad"
          />
          <Field label="Soliq stavkasi (%, ixtiyoriy)" value={draft.taxRate} onChangeText={(taxRate) => setDraft({ ...draft, taxRate })} keyboardType="decimal-pad" />
          <Field label="Shtrix-kod (ixtiyoriy)" value={draft.barcode} onChangeText={(barcode) => setDraft({ ...draft, barcode })} keyboardType="number-pad" />
          <ImageField label="Rasm" current={draft.currentImage} picked={draft.image} onPick={(image) => setDraft({ ...draft, image })} />
          <SwitchRow label="Menyuda bor" hint="O'chirilsa 'Tugagan' bo'ladi - buyurtmaga qo'shib bo'lmaydi." value={draft.available} onChange={(available) => setDraft({ ...draft, available })} />
          <Button title="Saqlash" loading={busy} onPress={() => void saveProduct()} />
          <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setDraft(null)} />
        </FormCard>
      )}

      {isManager && (
        <Field label="Qidirish (nom yoki shtrix-kod)" value={search} onChangeText={setSearch} autoCapitalize="none" />
      )}

      {isManager && products === null && !error && <Muted>Yuklanmoqda...</Muted>}

      {grouped.map(({ category, items }) => (
        <View key={category.id} style={{ gap: 10 }}>
          <SectionTitle>{category.name}</SectionTitle>
          {items.map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {p.image ? <Image source={{ uri: p.image }} style={{ width: 56, height: 56, borderRadius: 12 }} contentFit="cover" /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={18} weight={600}>
                    {p.name}
                  </Txt>
                  <Muted>
                    {formatMoney(p.price)}
                    {p.barcode ? ` · ${p.barcode}` : ''}
                  </Muted>
                </View>
                <Pill label={p.is_available ? 'Bor' : 'Tugagan'} kind={p.is_available ? 'ok' : 'warn'} />
              </View>
              {margin(p) && <Muted>{margin(p)}</Muted>}
              {Number(p.tax_rate) > 0 && <Muted>Soliq: {trimDecimal(p.tax_rate)}%</Muted>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  title={p.is_available ? 'Tugadi' : 'Qaytarish'}
                  variant="ghost"
                  compact
                  disabled={busy}
                  onPress={() => void run(() => pos.api.menu.updateProduct(p.id, { is_available: !p.is_available }), undefined, reload)}
                />
                <Button
                  title="Tahrirlash"
                  variant="ghost"
                  compact
                  disabled={busy}
                  onPress={() =>
                    setDraft({
                      id: p.id,
                      name: p.name,
                      price: trimDecimal(p.price),
                      categoryId: p.category.id,
                      barcode: p.barcode ?? '',
                      costPrice: Number(p.cost_price) > 0 ? trimDecimal(p.cost_price) : '',
                      taxRate: Number(p.tax_rate) > 0 ? trimDecimal(p.tax_rate) : '',
                      available: p.is_available,
                      image: null,
                      currentImage: p.image,
                    })
                  }
                />
                <Button title={recipeFor === p.id ? 'Retseptni yopish' : 'Retsept'} variant="ghost" compact disabled={busy} onPress={() => void openRecipe(p)} />
                <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDeleteProduct(p)} />
              </View>

              {recipeFor === p.id && (
                <View style={{ gap: 8 }}>
                  <SectionTitle>1 porsiyaga ketadigan ingredientlar</SectionTitle>
                  {recipe.length === 0 && <Muted>Retsept kiritilmagan - sotilganda ombor kamaymaydi.</Muted>}
                  {recipe.map((r) => (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Txt size={16} style={{ flex: 1 }}>
                        {r.ingredient.name} · {trimDecimal(r.quantity)} {r.ingredient.unit}
                      </Txt>
                      <Button
                        title="O'chirish"
                        variant="danger"
                        compact
                        disabled={busy}
                        onPress={() =>
                          void run(
                            () => pos.api.menu.deleteRecipeItem(r.id),
                            undefined,
                            async () => setRecipe(await pos.api.menu.recipe(p.id)),
                          )
                        }
                      />
                    </View>
                  ))}
                  {recipeDraft ? (
                    <>
                      <ChipSelect
                        label="Ingredient"
                        value={recipeDraft.ingredientId}
                        options={ingredients
                          .filter((i) => !recipe.some((r) => r.ingredient.id === i.id))
                          .map((i) => ({ value: i.id as number | null, label: `${i.name} (${i.unit})` }))}
                        onChange={(ingredientId) => setRecipeDraft({ ...recipeDraft, ingredientId })}
                      />
                      <Field label="Miqdori" value={recipeDraft.quantity} onChangeText={(quantity) => setRecipeDraft({ ...recipeDraft, quantity })} keyboardType="decimal-pad" />
                      <Button title="Qo'shish" loading={busy} onPress={() => void saveRecipeItem()} />
                      <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setRecipeDraft(null)} />
                    </>
                  ) : (
                    <Button
                      title="+ Ingredient qo'shish"
                      variant="ghost"
                      compact
                      disabled={ingredients.length === 0}
                      onPress={() => setRecipeDraft({ productId: p.id, ingredientId: null, quantity: '' })}
                    />
                  )}
                  {ingredients.length === 0 && <Muted>Avval "Ombor" bo'limida ingredient yarating.</Muted>}
                </View>
              )}
            </Card>
          ))}
        </View>
      ))}

      {isManager && (
        <>
          <SectionTitle
            right={!catDraft ? <Button title="+ Bo'lim" variant="ghost" compact onPress={() => setCatDraft({ name: '', printerId: null, image: null, currentImage: null })} /> : undefined}
          >
            Bo'limlar
          </SectionTitle>

          {catDraft && (
            <FormCard title={catDraft.id ? "Bo'limni tahrirlash" : "Yangi bo'lim"}>
              <Field label="Nomi" value={catDraft.name} onChangeText={(name) => setCatDraft({ ...catDraft, name })} autoCapitalize="sentences" />
              <ChipSelect
                label="Qaysi printerga chop etiladi"
                value={catDraft.printerId}
                options={[{ value: null as number | null, label: 'Printersiz' }, ...printers.map((pr) => ({ value: pr.id as number | null, label: pr.name }))]}
                onChange={(printerId) => setCatDraft({ ...catDraft, printerId })}
              />
              <ImageField label="Rasm" current={catDraft.currentImage} picked={catDraft.image} onPick={(image) => setCatDraft({ ...catDraft, image })} />
              <Button title="Saqlash" loading={busy} onPress={() => void saveCategory()} />
              <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setCatDraft(null)} />
            </FormCard>
          )}

          {categories.length === 0 && <Muted>Hali bo'lim yo'q.</Muted>}
          {categories.map((c) => {
            const count = (products ?? []).filter((p) => p.category.id === c.id).length;
            return (
              <Card key={c.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {c.image ? <Image source={{ uri: c.image }} style={{ width: 48, height: 48, borderRadius: 10 }} contentFit="cover" /> : null}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size={17} weight={600}>
                      {c.name}
                    </Txt>
                    <Muted>
                      {count} ta mahsulot · {c.printer ? `Printer: ${c.printer.name}` : 'printersiz'}
                    </Muted>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Button
                    title="Tahrirlash"
                    variant="ghost"
                    compact
                    disabled={busy}
                    onPress={() => setCatDraft({ id: c.id, name: c.name, printerId: c.printer?.id ?? null, image: null, currentImage: c.image })}
                  />
                  {/* Bo'lim o'chirilsa mahsulotlari ham o'chadi - faqat bo'sh bo'limga ruxsat */}
                  {products !== null && count === 0 && <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDeleteCategory(c)} />}
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
