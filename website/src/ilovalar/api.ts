import { MobileAppEntry } from './types';

export async function fetchApps(): Promise<MobileAppEntry[]> {
  const res = await fetch('/api/sync/public/apps/');
  if (!res.ok) throw new Error('apps fetch failed');
  return res.json();
}
