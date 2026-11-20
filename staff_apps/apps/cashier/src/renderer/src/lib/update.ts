import { mustUpdate, needsUpdate, type AppUpdateInfo } from '@pos/shared';
import { useCallback, useEffect, useState } from 'react';

import { pos } from './pos';

/** Bola'dagi shu ilova uchun o'rnatuvchining Ona'dagi `slug`i (MobileApp.slug). */
const SLUGS = ['kassir'];
const RECHECK_MS = 30 * 60_000;

export interface AppUpdateState {
  current: string;
  info: AppUpdateInfo | null;
  /** Majburiy: eski versiya bilan ishlashga ruxsat yo'q. */
  required: boolean;
  /** Ixtiyoriy yangilanish bor (va hozircha yopilmagan). */
  optional: boolean;
  dismiss: () => void;
  recheck: () => void;
}

/**
 * Server manzili ma'lum bo'lgach Bola'dan "yangi versiya bormi?" deb so'raydi (ishga tushganda va har 30 daqiqada).
 * Tarmoq xatosi jim o'tkaziladi - yangilanish tekshiruvi kassani hech qachon to'xtatmasligi kerak.
 */
export function useAppUpdate(serverUrl: string | null): AppUpdateState {
  const [current, setCurrent] = useState('');
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    window.posNative.updates.currentVersion().then(setCurrent, () => {});
  }, []);

  useEffect(() => {
    if (!serverUrl || !current) return;
    let alive = true;
    const run = () =>
      pos.api
        .appUpdate({ slugs: SLUGS, platform: 'windows', current })
        .then((r) => alive && setInfo(r))
        .catch(() => {});
    void run();
    const t = setInterval(run, RECHECK_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [serverUrl, current, tick]);

  const dismiss = useCallback(() => setDismissed(info?.latest?.version ?? null), [info]);
  const recheck = useCallback(() => setTick((n) => n + 1), []);
  const required = !!current && mustUpdate(info, current);
  const optional = !!current && !required && needsUpdate(info, current) && dismissed !== info?.latest?.version;
  return { current, info, required, optional, dismiss, recheck };
}
