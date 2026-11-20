import {
  formatMoney,
  formatPhone,
  normalizePhone,
  parseDecimalInput,
  type Customer,
  type DebtTransaction,
  type PaymentMethod,
} from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { ChipSelect, FormCard, SectionTitle, SwitchRow } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Segmented, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

type Filter = 'all' | 'debt';

interface Draft {
  id?: number;
  firstName: string;
  lastName: string;
  phone: string;
  note: string;
  active: boolean;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Naqd' },
  { value: 'card', label: 'Karta' },
  { value: 'other', label: 'Boshqa' },
];

const TXN_LABEL = { credit_sale: 'Nasiya sotuv', repayment: "To'lov", adjustment: 'Tuzatish' } as const;

const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Nasiya mijozlari (kassir/menejer): ro'yxat, qidiruv, qo'shish/tahrirlash, qarz tarixi va qarzni qaytarish. */
export default function CustomersScreen() {
  const { user } = useSession();
  const allowed = user?.role === 'manager' || user?.role === 'cashier';
  const hand = useHand();
  const { busy, error, info, setError, run } = useManage();
  const [list, setList] = useState<Customer[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [txns, setTxns] = useState<DebtTransaction[]>([]);
  const [repay, setRepay] = useState<{ id: number; amount: string; method: PaymentMethod; note: string } | null>(null);

  const load = useCallback(async () => {
    const res = await pos.api.customers.list({ search: search.trim() || undefined, has_debt: filter === 'debt' });
    setList(res.results);
  }, [search, filter]);

  useEffect(() => {
    if (!allowed) return;
    // Qidiruvda har harfga so'rov yubormaslik uchun biroz kutamiz.
    const t = setTimeout(() => void run(async () => undefined, undefined, load), 300);
    return () => clearTimeout(t);
  }, [allowed, load, run]);

  async function save() {
    if (!draft) return;
    const phone = draft.phone.trim() ? normalizePhone(draft.phone) : '';
    if (!draft.firstName.trim()) return setError('Mijoz ismini kiriting.');
    if (phone === null) return setError("Telefon raqami noto'g'ri (masalan 90 123 45 67).");
    const body = { first_name: draft.firstName.trim(), last_name: draft.lastName.trim(), phone, note: draft.note.trim(), is_active: draft.active };
    const ok = await run(() => (draft.id ? pos.api.customers.update(draft.id, body) : pos.api.customers.create(body)), undefined, load);
    if (ok) setDraft(null);
  }

  async function toggleHistory(c: Customer) {
    if (openId === c.id) return setOpenId(null);
    setOpenId(c.id);
    setTxns([]);
    await run(async () => setTxns(await pos.api.customers.transactions(c.id)));
  }

  async function submitRepay() {
    if (!repay) return;
    const amount = parseDecimalInput(repay.amount);
    if (amount === null || Number(amount) <= 0) return setError("To'lov summasini (0 dan katta) kiriting.");
    const customerId = repay.id;
    const ok = await run(
      () => pos.api.customers.repay(customerId, { amount, method: repay.method, note: repay.note.trim() || undefined }),
      "To'lov qabul qilindi.",
      async () => {
        await load();
        if (openId === customerId) setTxns(await pos.api.customers.transactions(customerId));
      },
    );
    if (ok) setRepay(null);
  }

  return (
    <Screen onRefresh={() => void run(async () => undefined, undefined, load)}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Nasiya daftari</Eyebrow>
          <Title size={48}>Mijozlar</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!allowed && <ErrorText>Bu bo'lim faqat menejer va kassir uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      {info && <Muted>{info}</Muted>}

      {allowed && !draft && <Button title="+ Yangi mijoz" onPress={() => setDraft({ firstName: '', lastName: '', phone: '', note: '', active: true })} />}

      {draft && (
        <FormCard title={draft.id ? 'Mijozni tahrirlash' : 'Yangi mijoz'}>
          <Field label="Ism" value={draft.firstName} onChangeText={(firstName) => setDraft({ ...draft, firstName })} autoCapitalize="words" />
          <Field label="Familiya (ixtiyoriy)" value={draft.lastName} onChangeText={(lastName) => setDraft({ ...draft, lastName })} autoCapitalize="words" />
          <Field label="Telefon (ixtiyoriy)" value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} keyboardType="phone-pad" placeholder="90 123 45 67" />
          <Field label="Izoh (ixtiyoriy)" value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} autoCapitalize="sentences" />
          {draft.id && <SwitchRow label="Faol" hint="Faol bo'lmagan mijozga yangi nasiya berilmaydi." value={draft.active} onChange={(active) => setDraft({ ...draft, active })} />}
          <Button title="Saqlash" loading={busy} onPress={() => void save()} />
          <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setDraft(null)} />
        </FormCard>
      )}

      {allowed && (
        <>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Hammasi' },
              { value: 'debt', label: 'Qarzdorlar' },
            ]}
          />
          <Field label="Qidirish (ism yoki telefon)" value={search} onChangeText={setSearch} />
        </>
      )}

      {allowed && list === null && !error && <Muted>Yuklanmoqda...</Muted>}
      {list?.length === 0 && <Muted>Mijoz topilmadi.</Muted>}

      {list?.map((c) => {
        const debt = Number(c.balance);
        return (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt size={18} weight={600} style={{ flex: 1 }}>
                {`${c.first_name} ${c.last_name}`.trim()}
              </Txt>
              {!c.is_active && <Pill label="Faol emas" />}
              <Pill label={debt > 0 ? `Qarz ${formatMoney(c.balance)}` : "Qarzi yo'q"} kind={debt > 0 ? 'warn' : 'ok'} />
            </View>
            {c.phone ? <Muted>{formatPhone(c.phone)}</Muted> : null}
            {c.note ? <Muted>{c.note}</Muted> : null}

            {repay?.id === c.id && (
              <>
                <Field label={`To'lov summasi (qarz ${formatMoney(c.balance)})`} value={repay.amount} onChangeText={(amount) => setRepay({ ...repay, amount })} keyboardType="decimal-pad" />
                <ChipSelect<PaymentMethod> label="To'lov usuli" value={repay.method} options={METHODS} onChange={(method) => setRepay({ ...repay, method })} />
                <Field label="Izoh (ixtiyoriy)" value={repay.note} onChangeText={(note) => setRepay({ ...repay, note })} autoCapitalize="sentences" />
                <Button title="To'lovni qabul qilish" loading={busy} onPress={() => void submitRepay()} />
                <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setRepay(null)} />
              </>
            )}

            {repay?.id !== c.id && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {debt > 0 && <Button title="Qarzni qaytarish" compact disabled={busy} onPress={() => setRepay({ id: c.id, amount: '', method: 'cash', note: '' })} />}
                <Button title={openId === c.id ? 'Tarixni yopish' : 'Tarix'} variant="ghost" compact disabled={busy} onPress={() => void toggleHistory(c)} />
                <Button
                  title="Tahrirlash"
                  variant="ghost"
                  compact
                  disabled={busy}
                  onPress={() => setDraft({ id: c.id, firstName: c.first_name, lastName: c.last_name, phone: c.phone, note: c.note, active: c.is_active })}
                />
              </View>
            )}

            {openId === c.id && (
              <View style={{ gap: 6 }}>
                <SectionTitle>Qarz tarixi</SectionTitle>
                {txns.length === 0 && <Muted>Harakat yo'q.</Muted>}
                {txns.map((t) => (
                  <View key={t.id} style={{ gap: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Txt size={15} weight={500}>
                        {TXN_LABEL[t.txn_type]}
                      </Txt>
                      <Txt size={15} weight={600}>
                        {formatMoney(t.amount)}
                      </Txt>
                    </View>
                    <Muted>
                      {stamp(t.created_at)}
                      {t.created_by ? ` · ${t.created_by.first_name}` : ''}
                      {t.due_date ? ` · muddat ${t.due_date}` : ''}
                      {t.note ? ` · ${t.note}` : ''}
                    </Muted>
                  </View>
                ))}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
