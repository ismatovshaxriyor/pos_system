import {
  formatPhone,
  fullName,
  normalizePhone,
  type AttendanceRecord,
  type RegistrationCode,
  type Role,
  type User,
} from '@pos/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { useRealtimeRefresh, useSession } from '@/lib/hooks';
import { useManage } from '@/lib/manage';
import { pos } from '@/lib/pos';
import { ChipSelect, FormCard, SectionTitle } from '@/ui/forms';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

const ROLE_LABEL: Record<Role, string> = { manager: 'Menejer', cashier: 'Kassir', waiter: 'Ofitsiant' };
const ROLES: Role[] = ['waiter', 'cashier', 'manager'];

interface Draft {
  id?: number;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  password: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => `${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`;
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const human = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

/** Ishlagan vaqt: "6 soat 20 daq" (ketmagan bo'lsa hozirgacha). */
function worked(a: AttendanceRecord): string {
  const end = a.check_out ? new Date(a.check_out).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - new Date(a.check_in).getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} soat ${mins % 60} daq` : `${mins} daq`;
}

/**
 * Menejer: xodimlar (qo'shish, ism/lavozim/parolni o'zgartirish, o'chirish), kassir uchun kirish kodi
 * va davomat tarixi (sana bo'yicha; ishlagan vaqt bilan).
 */
const STAFF_EVENTS = ['staff_changed', 'devices_changed'] as const;
const ATTENDANCE_EVENTS = ['attendance_changed', 'register_closed'] as const;

export default function StaffScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const hand = useHand();
  const { busy, error, setError, run } = useManage();
  const [staff, setStaff] = useState<User[] | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [day, setDay] = useState(() => new Date());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [code, setCode] = useState<RegistrationCode | null>(null);

  const loadStaff = useCallback(async () => setStaff(await pos.api.staff.list()), []);
  const loadAttendance = useCallback(async () => {
    const res = await pos.api.staff.attendance({ date: ymd(day) });
    setRecords(res.results);
  }, [day]);

  useRealtimeRefresh(STAFF_EVENTS, loadStaff);
  useRealtimeRefresh(ATTENDANCE_EVENTS, loadAttendance);

  useEffect(() => {
    if (isManager) void run(async () => undefined, undefined, loadStaff);
  }, [isManager, loadStaff, run]);

  useEffect(() => {
    if (isManager) void run(async () => undefined, undefined, loadAttendance);
  }, [isManager, loadAttendance, run]);

  const shiftDay = (delta: number) => setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
  const isToday = ymd(day) === ymd(new Date());

  async function save() {
    if (!draft) return;
    const phone = normalizePhone(draft.phone);
    const needsPassword = draft.role !== 'cashier';
    const isNew = draft.id === undefined;
    if (!draft.firstName.trim()) return setError('Ismni kiriting.');
    if (isNew && !phone) return setError("To'g'ri telefon raqamini kiriting.");
    if (needsPassword && isNew && draft.password.length < 6) return setError("Parol kamida 6 ta belgi bo'lsin.");
    if (needsPassword && draft.password && draft.password.length < 6) return setError("Yangi parol kamida 6 ta belgi bo'lsin.");

    const base = { first_name: draft.firstName.trim(), last_name: draft.lastName.trim(), role: draft.role };
    const password = needsPassword && draft.password ? { password: draft.password } : {};
    let created: User | null = null;
    const ok = await run(
      async () => {
        if (isNew) created = await pos.api.staff.create({ ...base, username: phone as string, ...password });
        else await pos.api.staff.update(draft.id as number, { ...base, ...password });
      },
      undefined,
      loadStaff,
    );
    if (!ok) return;
    setDraft(null);
    // Kassir parolsiz yaratiladi - darhol ro'yxatdan o'tish kodini ko'rsatamiz.
    const made = created as User | null;
    if (made && made.role === 'cashier') await run(async () => setCode(await pos.api.staff.registrationCode(made.id)));
  }

  function confirmDelete(u: User) {
    Alert.alert("Xodimni o'chirish", `${fullName(u) || u.username} tizimdan o'chiriladi. Buyurtma tarixi bor xodimni o'chirib bo'lmasligi mumkin.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.staff.delete(u.id), undefined, loadStaff) },
    ]);
  }

  return (
    <Screen onRefresh={() => void run(async () => undefined, undefined, async () => void (await Promise.all([loadStaff(), loadAttendance()])))}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Boshqaruv</Eyebrow>
          <Title size={48}>Xodimlar</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}

      {code && (
        <Card>
          <Txt size={14} weight={500} tone="muted">
            {fullName(code.user)} uchun ro'yxatdan o'tish kodi
          </Txt>
          <Txt size={44} weight={600} family="mono">
            {code.code}
          </Txt>
          <Muted>Kod {hhmm(code.expires_at)} gacha amal qiladi. Xodim uni o'z qurilmasida kiritib, PIN o'rnatadi.</Muted>
          <Button title="Yopish" variant="ghost" compact onPress={() => setCode(null)} />
        </Card>
      )}

      {isManager && !draft && (
        <Button title="+ Yangi xodim" onPress={() => setDraft({ firstName: '', lastName: '', phone: '', role: 'waiter', password: '' })} />
      )}

      {draft && (
        <FormCard title={draft.id ? 'Xodimni tahrirlash' : 'Yangi xodim'}>
          <Field label="Ism" value={draft.firstName} onChangeText={(firstName) => setDraft({ ...draft, firstName })} autoCapitalize="words" />
          <Field label="Familiya" value={draft.lastName} onChangeText={(lastName) => setDraft({ ...draft, lastName })} autoCapitalize="words" />
          {draft.id === undefined ? (
            <Field label="Telefon (kirish uchun login)" value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} keyboardType="phone-pad" placeholder="90 123 45 67" />
          ) : (
            <Muted>Telefon (login): {formatPhone(draft.phone)} - o'zgartirib bo'lmaydi.</Muted>
          )}
          <ChipSelect<Role> label="Lavozimi" value={draft.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} onChange={(role) => setDraft({ ...draft, role })} />
          {draft.role === 'cashier' ? (
            <Muted>Kassirga parol berilmaydi: kirish kodi orqali PIN'ni o'zi o'rnatadi.</Muted>
          ) : (
            <Field
              label={draft.id ? "Yangi parol (o'zgartirmasangiz bo'sh qoldiring)" : 'Parol (kamida 6 ta belgi)'}
              value={draft.password}
              onChangeText={(password) => setDraft({ ...draft, password })}
              secureTextEntry
            />
          )}
          <Button title="Saqlash" loading={busy} onPress={() => void save()} />
          <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setDraft(null)} />
        </FormCard>
      )}

      {isManager && (
        <>
          <SectionTitle>Davomat</SectionTitle>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Button title="←" variant="ghost" compact onPress={() => shiftDay(-1)} />
            <Txt size={17} weight={600}>
              {isToday ? 'Bugun' : human(day)}
            </Txt>
            <Button title="→" variant="ghost" compact disabled={isToday} onPress={() => shiftDay(1)} />
          </View>
          <Card>
            {records === null && <Muted>Yuklanmoqda...</Muted>}
            {records?.length === 0 && <Muted>Bu kuni hech kim kelmagan.</Muted>}
            {records?.map((a) => (
              <View key={a.id} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Txt size={16} weight={500} style={{ flex: 1 }}>
                    {fullName(a.user)}
                  </Txt>
                  <Pill label={a.check_out ? 'Ketgan' : 'Ishda'} kind={a.check_out ? 'neutral' : 'ok'} />
                </View>
                <Muted>
                  {hhmm(a.check_in)} – {a.check_out ? hhmm(a.check_out) : 'hozir'} · {worked(a)}
                </Muted>
              </View>
            ))}
          </Card>
        </>
      )}

      {isManager && staff === null && !error && <Muted>Yuklanmoqda...</Muted>}

      {isManager && <SectionTitle>Xodimlar ro'yxati</SectionTitle>}
      {staff?.map((u) => (
        <Card key={u.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Txt size={18} weight={600} style={{ flex: 1 }}>
              {fullName(u) || u.username}
            </Txt>
            <Pill label={ROLE_LABEL[u.role]} kind="neutral" />
          </View>
          <Muted>{formatPhone(u.username)}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              title="Tahrirlash"
              variant="ghost"
              compact
              disabled={busy}
              onPress={() => setDraft({ id: u.id, firstName: u.first_name, lastName: u.last_name, phone: u.username, role: u.role, password: '' })}
            />
            {u.role === 'cashier' && <Button title="Kirish kodi" variant="ghost" compact disabled={busy} onPress={() => void run(async () => setCode(await pos.api.staff.registrationCode(u.id)))} />}
            {u.id !== user?.id && <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDelete(u)} />}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
