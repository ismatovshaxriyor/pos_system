import { describeError, findServers, mdnsToUrls, mergeFound, type FoundServer, type ScanProgress } from '@pos/shared';
import { getIpAddressAsync } from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { browseMdns } from '@/lib/mdns';
import { pos } from '@/lib/pos';
import { Button, Card, ErrorText, Eyebrow, Field, LinkButton, Muted, Screen, Title, Txt } from '@/ui/kit';

/**
 * Birinchi ishga tushirish: restoran serveri (Bola) telefon turgan WiFi tarmog'idan o'zi topiladi
 * (/24 tarmoqni `GET /api/discovery/` bilan skanerlash - native modul kerak emas, Expo Go'da ham ishlaydi).
 * Bitta server topilsa darhol ulanadi, bir nechta bo'lsa tanlash ro'yxati chiqadi, topilmasa qo'lda kiritish mumkin.
 */
export default function ConnectScreen() {
  const [servers, setServers] = useState<FoundServer[]>([]);
  const [searching, setSearching] = useState(true);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Qidiruv davomida hech narsa topilmadi, lekin kamida bitta manzil javob berib rad etdi (masalan 400) - demak
      tarmoqda server bor, lekin noto'g'ri sozlangan. Bu holatda "topilmadi" emas, aniqroq xabar ko'rsatiladi. */
  const [rejected, setRejected] = useState<{ url: string; status: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async (target: string) => {
    if (!target.trim()) return;
    setBusy(target);
    setError(null);
    try {
      await pos.connectToServer(target);
      // Muvaffaqiyatli bo'lsa root layout guard'lari login ekraniga o'zi o'tkazadi.
    } catch (e) {
      setError(describeError(e));
      setBusy(null);
    }
  }, []);

  const search = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    setServers([]);
    setProgress(null);
    setError(null);
    setRejected(null);
    let localIps: string[] = [];
    try {
      localIps = [await getIpAddressAsync()];
    } catch {
      /* WiFi'ga ulanmagan - faqat qo'lda kiritish qoladi */
    }
    // mDNS (native build'da) tezkor yo'l; Expo Go'da bo'sh qaytadi va skaner topadi.
    const mdnsUrls = mdnsToUrls(await browseMdns());
    // Sekin router/yuklangan server bitta urinishda ulgurmasligi mumkin: topilmasa, timeout'ni
    // oshirib (tezkor -> sekin) yana ikki marta urinamiz. Birinchi topilganda to'xtaydi.
    let found: FoundServer[] = [];
    for (const timeoutMs of [800, 2000, 4000]) {
      if (ctrl.signal.aborted) return;
      found = await findServers({
        localIps,
        // Haqiqiy o'rnatishda Bola doim 8000'da. Ishlab chiqishda (Expo Go) dev compose portlari ham tekshiriladi.
        ports: __DEV__ ? [8000, 8010, 8020] : [8000],
        extraUrls: [...mdnsUrls, 'pos-bola.local:8000'],
        timeoutMs,
        extraTimeoutMs: Math.max(2500, timeoutMs),
        signal: ctrl.signal,
        onProgress: setProgress,
        onFound: (s) => setServers((prev) => mergeFound(prev, s)),
        onRejected: (url, status) => setRejected({ url, status }),
      });
      if (found.length > 0) break;
    }
    if (ctrl.signal.aborted) return;
    setSearching(false);
    if (found.length === 1) void connect(found[0]!.url);
  }, [connect]);

  useEffect(() => {
    void search();
    return () => abortRef.current?.abort();
  }, [search]);

  const showManual = manual || (!searching && servers.length === 0);
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Screen>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>HamrohPOS · Xodim</Eyebrow>
        <Title size={44}>Restoranga ulanish</Title>
      </View>

      {searching ? (
        <Muted>Telefon restoran WiFi tarmog'ida bo'lishi kerak. Restoran tizimi qidirilmoqda… {pct}%</Muted>
      ) : servers.length === 0 && rejected ? (
        <ErrorText>
          Tarmoqda server topildi ({rejected.url}), lekin u javobni rad etdi (xato {rejected.status}). Server noto'g'ri
          sozlangan bo'lishi mumkin - administratorga murojaat qiling.
        </ErrorText>
      ) : servers.length === 0 ? (
        <Muted>Restoran tizimi topilmadi. Telefon restoran WiFi tarmog'iga ulanganini tekshiring.</Muted>
      ) : null}

      {servers.map((s) => (
        <Pressable key={s.url} onPress={() => void connect(s.url)} disabled={busy !== null} accessibilityRole="button">
          <Card>
            <Txt size={20} weight={600}>
              {s.info.activated ? s.info.restaurant_name : 'Yangi restoran'}
            </Txt>
            {!s.info.activated && (
              <Txt size={13} tone="muted">
                Hali sozlanmagan
              </Txt>
            )}
          </Card>
        </Pressable>
      ))}

      {error && <ErrorText>{error}</ErrorText>}

      {showManual ? (
        <>
          <Field
            label="Tizim manzili (menejerdan oling)"
            value={url}
            onChangeText={setUrl}
            placeholder="192.168.1.50:8000"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void connect(url)}
          />
          <Muted>Restoranda: server IP manzili. Uydan: restoran domeni, masalan rohat.hamrohpos.uz.</Muted>
          <Button title="Ulanish" onPress={() => void connect(url)} loading={busy === url} disabled={busy !== null || !url.trim()} />
        </>
      ) : (
        <LinkButton title="Topilmadimi? Manzilni qo'lda kiriting" onPress={() => setManual(true)} />
      )}

      {!searching && <Button title="Qayta qidirish" variant="ghost" onPress={() => void search()} disabled={busy !== null} />}
    </Screen>
  );
}
