import { describeError, type Table, type TableZone } from '@pos/shared';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { useBootstrap, useSession } from '@/lib/hooks';
import { pos } from '@/lib/pos';
import { FormSheet, useHeld } from '@/ui/forms';
import { Chip } from '@/ui/parts';
import { Button, Card, ErrorText, Eyebrow, Field, Muted, Pill, Screen, Title, Txt } from '@/ui/kit';
import { useNotify } from '@/ui/toast';
import { useHand } from '@/ui/theme';

interface TableDraft {
  id?: number;
  name: string;
  capacity: string;
  zoneId: number | null;
}

/**
 * Menejer: zal tuzilmasi - zonalar va stollar. Stol o'chirilmaydi (eski buyurtmalar unga ishora
 * qiladi), "Yashirish" bilan faolsizlantiriladi va ofitsiantlar ro'yxatidan yo'qoladi.
 */
export default function FloorScreen() {
  const { user } = useSession();
  const isManager = user?.role === 'manager';
  const { data, refresh } = useBootstrap();
  const hand = useHand();
  const [tables, setTables] = useState<Table[] | null>(null);
  const [draft, setDraft] = useState<TableDraft | null>(null);
  const shown = useHeld(draft);
  const [zoneDraft, setZoneDraft] = useState<{ id?: number; name: string } | null>(null);
  const [qrFor, setQrFor] = useState<number | null>(null);
  const [sharing, setSharing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  useNotify(error, info, draft !== null || zoneDraft !== null);

  const zones: TableZone[] = data?.table_zones ?? [];
  const [search, setSearch] = useState('');
  // 'all' - hammasi, 'none' - zonasizlar, son - zona id
  const [zoneFilter, setZoneFilter] = useState<'all' | 'none' | number>('all');
  const visibleTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tables ?? []).filter(
      (t) =>
        (zoneFilter === 'all' || (zoneFilter === 'none' ? !t.zone : t.zone?.id === zoneFilter)) &&
        (!q || t.name.toLowerCase().includes(q)),
    );
  }, [tables, search, zoneFilter]);

  const load = useCallback(async () => {
    try {
      setTables(await pos.api.floor.tables());
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    if (isManager) void load();
  }, [isManager, load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      await Promise.all([load(), refresh()]);
      if (done) setInfo(done);
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveTable() {
    if (!draft) return;
    const capacity = Number(draft.capacity);
    if (!draft.name.trim() || !Number.isInteger(capacity) || capacity < 1) {
      setError("Stol nomi va o'rinlar sonini (1 dan katta butun son) kiriting.");
      return;
    }
    const body = { name: draft.name.trim(), capacity, zone_id: draft.zoneId };
    const ok = await run(() => (draft.id ? pos.api.floor.updateTable(draft.id, body) : pos.api.floor.createTable(body)), 'Stol saqlandi.');
    if (ok) setDraft(null);
  }

  async function saveZone() {
    if (!zoneDraft) return;
    const name = zoneDraft.name.trim();
    if (!name) {
      setError('Zona nomini kiriting.');
      return;
    }
    const ok = await run(() => (zoneDraft.id ? pos.api.floor.updateZone(zoneDraft.id, { name }) : pos.api.floor.createZone({ name })), 'Zona saqlandi.');
    if (ok) setZoneDraft(null);
  }

  function confirmDeleteTable(t: Table) {
    Alert.alert("Stolni o'chirish", `"${t.name}" o'chiriladi. Buyurtma tarixi bor stolni o'chirib bo'lmaydi - u holda "Yashirish"dan foydalaning.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.floor.deleteTable(t.id), "Stol o'chirildi.") },
    ]);
  }

  /** QR rasm autentifikatsiya talab qiladi: sarlavhalar bilan yuklanadi. */
  function qrSource(id: number) {
    const base = pos.session.getBaseUrl() ?? '';
    const token = pos.session.getToken();
    const device = pos.session.getDeviceId();
    return {
      uri: `${base}/api${pos.api.floor.qrCodeUrl(id)}`,
      headers: { ...(token ? { Authorization: `Token ${token}` } : {}), ...(device ? { 'X-Device-ID': device } : {}) },
    };
  }

  /**
   * QR rasmini (PNG) keshga yuklab, tizimning "Ulashish" oynasini ochadi: galereyaga saqlash, Telegram, chop etish.
   * Rasm server tomonida domen bilan yasaladi, shuning uchun ilova ichida qayta chizilmaydi.
   */
  async function shareQr(t: Table) {
    setSharing(t.id);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error("Bu qurilmada fayl ulashish mavjud emas.");
      const src = qrSource(t.id);
      const safe = t.name.replace(/[\\/:*?"<>|'\s]+/g, '-').replace(/^-+|-+$/g, '') || String(t.id);
      const file = new File(Paths.cache, `qr-${safe}.png`);
      if (file.exists) file.delete();
      const saved = await File.downloadFileAsync(src.uri, file, { headers: src.headers });
      await Sharing.shareAsync(saved.uri, { mimeType: 'image/png', dialogTitle: `${t.name} - QR kod`, UTI: 'public.png' });
    } catch (e) {
      // Xato ro'yxat tepasidagi matnda ko'rinmay qolishi mumkin (QR pastda), shuning uchun oyna.
      Alert.alert('QR kod yuklanmadi', describeError(e));
    } finally {
      setSharing(null);
    }
  }

  function confirmDeleteZone(z: TableZone) {
    Alert.alert("Zonani o'chirish", `"${z.name}" zonasi o'chiriladi. Stollar o'chmaydi, zonasiz qoladi.`, [
      { text: "Yo'q", style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void run(() => pos.api.floor.deleteZone(z.id), "Zona o'chirildi.") },
    ]);
  }

  return (
    <Screen onRefresh={() => void Promise.all([load(), refresh()])}>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Boshqaruv</Eyebrow>
          <Title size={48}>Stollar</Title>
        </View>
        <Button title="← Orqaga" variant="ghost" compact onPress={() => router.back()} />
      </View>

      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}

      {isManager && (
        <Button
          title="+ Yangi stol"
          onPress={() => {
            setError(null);
            setDraft({ name: '', capacity: '4', zoneId: zones[0]?.id ?? null });
          }}
        />
      )}

      <FormSheet
        visible={draft !== null}
        title={shown?.id ? 'Stolni tahrirlash' : 'Yangi stol'}
        busy={busy}
        error={error}
        onClose={() => setDraft(null)}
        onSave={() => void saveTable()}
      >
        {shown && (
          <>
          <Field label="Nomi (masalan: 5-stol)" value={shown.name} onChangeText={(name) => setDraft({ ...shown, name })} autoCapitalize="sentences" />
          <Field
            label="O'rinlar soni"
            value={shown.capacity}
            onChangeText={(capacity) => setDraft({ ...shown, capacity: capacity.replace(/\D/g, '') })}
            keyboardType="number-pad"
          />
          <Txt size={14} weight={500} tone="muted">
            Zona
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button title="Zonasiz" compact variant={shown.zoneId === null ? 'primary' : 'ghost'} onPress={() => setDraft({ ...shown, zoneId: null })} />
            {zones.map((z) => (
              <Button key={z.id} title={z.name} compact variant={shown.zoneId === z.id ? 'primary' : 'ghost'} onPress={() => setDraft({ ...shown, zoneId: z.id })} />
            ))}
          </View>
          </>
        )}
      </FormSheet>

      {isManager && (
        <Card>
          <Txt size={17} weight={600}>
            Zonalar
          </Txt>
          {zones.length === 0 && <Muted>Hali zona yo'q (masalan: Zal, Terrasa, VIP).</Muted>}
          {zones.map((z) => (
            <View key={z.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={16} style={{ flex: 1 }}>
                {z.name}
              </Txt>
              <Button title="Nomi" variant="ghost" compact disabled={busy} onPress={() => setZoneDraft({ id: z.id, name: z.name })} />
              <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDeleteZone(z)} />
            </View>
          ))}
          {zoneDraft ? (
            <>
              <Field label="Zona nomi" value={zoneDraft.name} onChangeText={(name) => setZoneDraft({ ...zoneDraft, name })} autoCapitalize="sentences" />
              <Button title="Saqlash" loading={busy} onPress={() => void saveZone()} />
              <Button title="Bekor qilish" variant="ghost" disabled={busy} onPress={() => setZoneDraft(null)} />
            </>
          ) : (
            <Button title="+ Yangi zona" variant="ghost" compact onPress={() => setZoneDraft({ name: '' })} />
          )}
        </Card>
      )}

      {isManager && tables === null && !error && <Muted>Yuklanmoqda...</Muted>}

      {isManager && tables !== null && tables.length > 0 && (
        <>
          <Field label="Stol qidirish" value={search} onChangeText={setSearch} placeholder="Nomi bo'yicha" />
          {(zones.length > 0 || tables.some((t) => !t.zone)) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label="Hammasi" active={zoneFilter === 'all'} onPress={() => setZoneFilter('all')} />
              {zones.map((z) => (
                <Chip key={z.id} label={z.name} active={zoneFilter === z.id} onPress={() => setZoneFilter(z.id)} />
              ))}
              {tables.some((t) => !t.zone) && zones.length > 0 && <Chip label="Zonasiz" active={zoneFilter === 'none'} onPress={() => setZoneFilter('none')} />}
            </View>
          )}
          {visibleTables.length === 0 && <Muted>Stol topilmadi.</Muted>}
        </>
      )}

      {visibleTables.map((t) => (
        <Card key={t.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Txt size={18} weight={600} style={{ flex: 1 }}>
              {t.name}
            </Txt>
            <Pill label={t.is_active ? 'Faol' : 'Yashirin'} kind={t.is_active ? 'ok' : 'neutral'} />
          </View>
          <Muted>
            {t.capacity} o'rin · {t.zone?.name ?? 'Zonasiz'}
          </Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              title="Tahrirlash"
              variant="ghost"
              compact
              disabled={busy}
              onPress={() => {
                setError(null);
                setDraft({ id: t.id, name: t.name, capacity: String(t.capacity), zoneId: t.zone?.id ?? null });
              }}
            />
            <Button
              title={t.is_active ? 'Yashirish' : 'Qaytarish'}
              variant="ghost"
              compact
              disabled={busy}
              onPress={() => void run(() => pos.api.floor.updateTable(t.id, { is_active: !t.is_active }))}
            />
            <Button title={qrFor === t.id ? 'QR ni yopish' : 'QR kod'} variant="ghost" compact onPress={() => setQrFor(qrFor === t.id ? null : t.id)} />
            <Button title="O'chirish" variant="danger" compact disabled={busy} onPress={() => confirmDeleteTable(t)} />
          </View>
          {qrFor === t.id && (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Image source={qrSource(t.id)} style={{ width: 220, height: 220 }} contentFit="contain" />
              <Button
                title={sharing === t.id ? 'Tayyorlanmoqda…' : 'Yuklab olish / ulashish'}
                compact
                disabled={sharing !== null}
                onPress={() => void shareQr(t)}
              />
              <Muted>Mijoz skanerlasa shu stol menyusi ochiladi. Domen "Sozlamalar"da belgilanadi.</Muted>
            </View>
          )}
        </Card>
      ))}
    </Screen>
  );
}
