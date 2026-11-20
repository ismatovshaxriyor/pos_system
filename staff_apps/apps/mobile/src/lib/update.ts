import { mustUpdate, needsUpdate, type AppUpdateInfo } from '@pos/shared';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { pos } from './pos';

/**
 * Bola'dagi shu ilova uchun o'rnatuvchining Ona'dagi `slug`lari (MobileApp.slug). Bitta Expo ilova ham menejer,
 * ham ofitsiant uchun - admin qaysi nom bilan yuklagan bo'lsa, eng yuqori versiya olinadi.
 */
const SLUGS = ['ofitsiant', 'manager'];
const RECHECK_MS = 30 * 60_000;

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

export interface AppUpdateState {
  info: AppUpdateInfo | null;
  required: boolean;
  optional: boolean;
  dismiss: () => void;
  /** Bola'dagi o'rnatuvchining to'liq manzili (brauzer/yuklab olish menejeri ochadi). */
  downloadUrl: string | null;
}

/**
 * Server manzili ma'lum bo'lgach Bola'dan "yangi versiya bormi?" deb so'raydi (ishga tushganda, har 30 daqiqada).
 * Tarmoq xatosi jim o'tkaziladi - tekshiruv ofitsiantni hech qachon to'xtatmasin.
 */
export function useAppUpdate(serverUrl: string | null): AppUpdateState {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!serverUrl || Platform.OS !== 'android') return;
    let alive = true;
    const run = () =>
      pos.api
        .appUpdate({ slugs: SLUGS, platform: 'android', current: APP_VERSION })
        .then((r) => alive && setInfo(r))
        .catch(() => {});
    void run();
    const t = setInterval(run, RECHECK_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [serverUrl]);

  const dismiss = useCallback(() => setDismissed(info?.latest?.version ?? null), [info]);
  const required = mustUpdate(info, APP_VERSION);
  const optional = !required && needsUpdate(info, APP_VERSION) && dismissed !== info?.latest?.version;
  const downloadUrl = serverUrl && info?.latest ? `${serverUrl}${info.latest.download_url}` : null;
  return { info, required, optional, dismiss, downloadUrl };
}
