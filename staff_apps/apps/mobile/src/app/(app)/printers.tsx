import { JOB_TYPE_LABEL, type PrintJob, type Printer, type PrinterCategoryOption } from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { ChipSelect, FormCard, SectionTitle, SwitchRow } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

interface Draft {
  id?: number;
  name: string;
  ip: string;
  port: string;
  width: number;
  active: boolean;
  cashier: boolean;
}

const WIDTHS = [
  { value: 48, label: '80 mm (48 belgi)' },
  { value: 32, label: '58 mm (32 belgi)' },
];

const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Menejer: oshxona/kassa printerlari. IP bo'sh - virtual printer (chek faqat oshxona ekranida), IP bor -
 * ESC/POS bilan bevosita (TCP). Qog'oz kengligi, faollik, kassa printeri belgisi, bo'limlarni biriktirish,
 * test chek va oxirgi chop etish navbati (muvaffaqiyatsizlari qizil).
 */
export default function PrintersScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const hand = useHand();
  const { busy, error, info, setError, run } = useManage();
  const [printers, setPrinters] = useState<Printer[] | null>(null);
  const [options, setOptions] = useState<PrinterCategoryOption[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState<{ id: number; selected: number[] } | null>(null);

  const load = useCallback(async () => {
    const [p, o, j] = await Promise.all([pos.api.printers.list(), pos.api.printers.categoryOptions(), pos.api.printers.jobs()]);
    setPrinters(p);
    setOptions(o);
    setJobs(j.results.slice(0, 15));
  }, []);

  useEffect(() => {
    if (isManager) void run(async () => undefined, undefined, load);
  }, [isManager, load, run]);

  async function save() {
    if (!draft) return;
    const port = Number(draft.port);
    if (!draft.name.trim() || !Number.isInteger(port) || port < 1 || port > 65535) return setError("Printer nomi va to'g'ri portni (odatda 9100) kiriting.");
    const body = { name: draft.name.trim(), ip_address: draft.ip.trim() || null, port, chars_per_line: draft.width, is_active: draft.active, is_cashier: draft.cashier };
    const ok = await run(() => (draft.id ? pos.api.printers.update(draft.id, body) : pos.api.printers.create(body)), undefined, load);
    if (ok) setDraft(null);
  }

  function confirmDelete(p: Printer) {
    Alert.alert("Printerni o'chirish", `"${p.name}" va uning chop etish tarixi o'chiriladi. Bo'limlari printersiz qoladi.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.printers.delete(p.id), undefined, load) },
    ]);
  }

  return (
    <Screen onRefresh={() => void run(async () => undefined, undefined, load)}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Boshqaruv</Eyebrow>
          <Title size={48}>Printerlar</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      {info && <Muted>{info}</Muted>}

      {isManager && !draft && <Button title="+ Yangi printer" onPress={() => setDraft({ name: '', ip: '', port: '9100', width: 48, active: true, cashier: false })} />}

      {draft && (
        <FormCard title={draft.id ? 'Printerni tahrirlash' : 'Yangi printer'}>
          <Field label="Nomi (masalan: Oshxona, Bar, Kassa)" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} autoCapitalize="sentences" />
          <Field label="IP manzil (bo'sh - virtual printer)" value={draft.ip} onChangeText={(ip) => setDraft({ ...draft, ip })} keyboardType="numbers-and-punctuation" placeholder="192.168.1.50" />
          <Field label="Port" value={draft.port} onChangeText={(port) => setDraft({ ...draft, port: port.replace(/\D/g, '') })} keyboardType="number-pad" />
          <ChipSelect label="Qog'oz kengligi" value={draft.width} options={WIDTHS} onChange={(width) => setDraft({ ...draft, width })} />
          <SwitchRow label="Kassa printeri" hint="Hisob-chek (shot) va to'lov cheklari shu printerdan chiqadi." value={draft.cashier} onChange={(cashier) => setDraft({ ...draft, cashier })} />
          <SwitchRow label="Faol" hint="O'chirilsa unga chek yuborilmaydi." value={draft.active} onChange={(active) => setDraft({ ...draft, active })} />
          <Button title="Saqlash" loading={busy} onPress={() => void save()} />
          <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setDraft(null)} />
        </FormCard>
      )}

      {isManager && printers === null && !error && <Muted>Yuklanmoqda...</Muted>}
      {printers?.length === 0 && <Muted>Hali printer yo'q.</Muted>}

      {printers?.map((p) => {
        const mine = options.filter((o) => o.printer_id === p.id);
        const isPicking = picking?.id === p.id;
        return (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt size={18} weight={600} style={{ flex: 1 }}>
                {p.name}
              </Txt>
              {p.is_cashier && <Pill label="Kassa" kind="ok" />}
              <Pill label={!p.is_active ? "O'chiq" : p.ip_address ? 'Tarmoq' : 'Virtual'} kind={!p.is_active ? 'warn' : p.ip_address ? 'ok' : 'neutral'} />
            </View>
            <Muted>{p.ip_address ? `${p.ip_address}:${p.port} · ${p.chars_per_line} belgi` : 'Chek faqat oshxona ekranida chiqadi'}</Muted>
            <Muted>Bo'limlar: {mine.length ? mine.map((o) => o.name).join(', ') : 'biriktirilmagan'}</Muted>

            {isPicking && (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {options.map((o) => {
                    const on = picking.selected.includes(o.id);
                    return (
                      <Button
                        key={o.id}
                        title={o.name}
                        compact
                        variant={on ? 'primary' : 'ghost'}
                        onPress={() => setPicking({ id: p.id, selected: on ? picking.selected.filter((x) => x !== o.id) : [...picking.selected, o.id] })}
                      />
                    );
                  })}
                </View>
                <Button
                  title="Saqlash"
                  loading={busy}
                  onPress={async () => {
                    if (await run(() => pos.api.printers.setCategories(p.id, picking.selected), "Bo'limlar yangilandi.", load)) setPicking(null);
                  }}
                />
                <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setPicking(null)} />
              </>
            )}

            {!isPicking && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button title="Bo'limlar" variant="ghost" compact disabled={busy} onPress={() => setPicking({ id: p.id, selected: mine.map((o) => o.id) })} />
                <Button
                  title="Tahrirlash"
                  variant="ghost"
                  compact
                  disabled={busy}
                  onPress={() => setDraft({ id: p.id, name: p.name, ip: p.ip_address ?? '', port: String(p.port), width: p.chars_per_line, active: p.is_active, cashier: p.is_cashier })}
                />
                {p.ip_address && <Button title="Test chek" variant="ghost" compact disabled={busy} onPress={() => void run(() => pos.api.printers.testPrint(p.id), 'Test chek yuborildi.')} />}
                <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDelete(p)} />
              </View>
            )}
          </Card>
        );
      })}

      {isManager && jobs.length > 0 && (
        <>
          <SectionTitle>Oxirgi cheklar</SectionTitle>
          <Card>
            {jobs.map((j) => (
              <View key={j.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Txt size={15} weight={500}>
                    {JOB_TYPE_LABEL[j.job_type]} · {j.printer_name}
                  </Txt>
                  <Muted>
                    {j.table_name || 'Stolsiz'} · {stamp(j.created_at)}
                  </Muted>
                </View>
                <Pill label={j.status === 'printed' ? 'Chiqdi' : j.status === 'failed' ? 'Xato' : 'Kutilmoqda'} kind={j.status === 'printed' ? 'ok' : j.status === 'failed' ? 'warn' : 'neutral'} />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
