import { formatPhone, normalizePhone, type Supplier } from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useRealtimeRefresh, useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { FormSheet, SwitchRow, useHeld } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { useNotify } from '@/ui/toast';
import { useHand } from '@/ui/theme';

interface Draft {
  id?: number;
  name: string;
  phone: string;
  note: string;
  active: boolean;
}

/** Ta'minotchilar (xomashyo yetkazib beruvchilar): nom, telefon, izoh, faollik. */
export default function SuppliersScreen() {
  const { user } = useSession();
  const allowed = user?.role === 'manager' || user?.role === 'cashier';
  const hand = useHand();
  const { busy, error, setError, run } = useManage();
  const [list, setList] = useState<Supplier[] | null>(null);
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (list ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || (digits.length >= 3 && s.phone.includes(digits)));
  }, [list, search]);
  const [draft, setDraft] = useState<Draft | null>(null);
  useNotify(error, null, draft !== null);
  const shown = useHeld(draft);

  const load = useCallback(async () => setList(await pos.api.inventory.suppliers()), []);

  useRealtimeRefresh(['inventory_changed'], load);

  useEffect(() => {
    if (allowed) void run(async () => undefined, undefined, load);
  }, [allowed, load, run]);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Ta'minotchi nomini kiriting.");
    const phone = draft.phone.trim() ? normalizePhone(draft.phone) : '';
    if (phone === null) return setError("Telefon raqami noto'g'ri (masalan 90 123 45 67).");
    const body = { name: draft.name.trim(), phone, note: draft.note.trim(), is_active: draft.active };
    const ok = await run(() => (draft.id ? pos.api.inventory.updateSupplier(draft.id, body) : pos.api.inventory.createSupplier(body)), "Ta'minotchi saqlandi.", load);
    if (ok) setDraft(null);
  }

  function confirmDelete(s: Supplier) {
    Alert.alert("Ta'minotchini o'chirish", `"${s.name}" o'chiriladi. Kirim tarixida ishlatilgan bo'lsa server rad etadi - u holda faolsizlantiring.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.inventory.deleteSupplier(s.id), "Ta'minotchi o'chirildi.", load) },
    ]);
  }

  return (
    <Screen onRefresh={() => void run(async () => undefined, undefined, load)}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Ombor</Eyebrow>
          <Title size={44}>Ta'minotchilar</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!allowed && <ErrorText>Bu bo'lim faqat menejer va kassir uchun.</ErrorText>}

      {allowed && (
        <Button
          title="+ Yangi ta'minotchi"
          onPress={() => {
            setError(null);
            setDraft({ name: '', phone: '', note: '', active: true });
          }}
        />
      )}

      <FormSheet
        visible={draft !== null}
        title={shown?.id ? "Ta'minotchini tahrirlash" : "Yangi ta'minotchi"}
        busy={busy}
        error={error}
        onClose={() => setDraft(null)}
        onSave={() => void save()}
      >
        {shown && (
          <>
          <Field label="Nomi" value={shown.name} onChangeText={(name) => setDraft({ ...shown, name })} autoCapitalize="sentences" />
          <Field label="Telefon (ixtiyoriy)" value={shown.phone} onChangeText={(phone) => setDraft({ ...shown, phone })} keyboardType="phone-pad" placeholder="90 123 45 67" />
          <Field label="Izoh (ixtiyoriy)" value={shown.note} onChangeText={(note) => setDraft({ ...shown, note })} autoCapitalize="sentences" />
          {shown.id && <SwitchRow label="Faol" value={shown.active} onChange={(active) => setDraft({ ...shown, active })} />}
          </>
        )}
      </FormSheet>

      {allowed && list === null && !error && <Muted>Yuklanmoqda...</Muted>}
      {list?.length === 0 && <Muted>Hali ta'minotchi yo'q.</Muted>}
      {allowed && list !== null && list.length > 5 && <Field label="Qidirish (nom yoki telefon)" value={search} onChangeText={setSearch} />}
      {allowed && list !== null && list.length > 0 && visible.length === 0 && <Muted>Ta'minotchi topilmadi.</Muted>}
      {visible.map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Txt size={18} weight={600} style={{ flex: 1 }}>
              {s.name}
            </Txt>
            {!s.is_active && <Pill label="Faol emas" />}
          </View>
          {s.phone ? <Muted>{formatPhone(s.phone)}</Muted> : null}
          {s.note ? <Muted>{s.note}</Muted> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button title="Tahrirlash" variant="ghost" compact disabled={busy} onPress={() => {
                setError(null);
                setDraft({ id: s.id, name: s.name, phone: s.phone, note: s.note, active: s.is_active });
              }} />
            {user?.role === 'manager' && <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDelete(s)} />}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
