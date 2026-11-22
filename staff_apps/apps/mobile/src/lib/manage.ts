import { describeError, type ImageUpload } from '@pos/shared';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

/**
 * Boshqaruv ekranlari uchun umumiy "so'rovni bajar" holati: `busy` ikki marta bosishdan saqlaydi,
 * `error` esa server/tarmoq xatosini (oddiy tilda) ko'rsatish uchun.
 */
export function useManage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /** `true` - muvaffaqiyatli. `after` (masalan ro'yxatni qayta yuklash) xato bo'lsa ham o'tkazib yuborilmaydi. */
  const run = useCallback(async (fn: () => Promise<unknown>, done?: string, after?: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    let ok = false;
    try {
      await fn();
      ok = true;
      if (done) setInfo(done);
    } catch (e) {
      setError(describeError(e));
    }
    try {
      await after?.();
    } catch (e) {
      if (ok) setError(describeError(e));
    }
    setBusy(false);
    return ok;
  }, []);

  return { busy, error, info, setError, setInfo, run };
}

/** Galereyadan bitta rasm tanlaydi; bekor qilinsa `null`. Sifat 0.7 - chek/menyu uchun yetarli, yuklash tez. */
export async function pickImage({ original = false }: { original?: boolean } = {}): Promise<ImageUpload | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // `original` (logo): kesish oynasi yo'q, chunki keng logo (masalan 1280x374) qirqilib qolmasin.
    // Qayta siqish ham yo'q: Android 0.7 da JPEG'ga o'tkazadi va PNG'ning shaffof foni qora bo'ladi.
    allowsEditing: !original,
    quality: original ? 1 : 0.7,
  });
  if (res.canceled || res.assets.length === 0) return null;
  const a = res.assets[0];
  const ext = (a.fileName?.split('.').pop() || a.uri.split('.').pop() || 'jpg').toLowerCase();
  return {
    uri: a.uri,
    name: a.fileName || `rasm.${ext}`,
    type: a.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg'),
    // Usiz `expo/fetch` faylni jo'nata olmaydi, sababi `ImageUpload` izohida.
    bytes: () => new File(a.uri).bytes(),
  };
}
