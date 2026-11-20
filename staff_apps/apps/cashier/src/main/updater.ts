import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { app } from 'electron';

import type { InstallUpdateResult } from '../shared/ipc';

/** Bola'ning o'rnatuvchi berish yo'li - boshqa hech narsa yuklanmaydi/ishga tushirilmaydi. */
const DOWNLOAD_PATH = /^\/api\/license\/app-updates\/\d+\/download\/$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 1024 * 1024 * 1024;

export function validateUpdateRequest(url: unknown, sha256: unknown): { url: URL; sha256: string } | string {
  if (typeof url !== 'string' || typeof sha256 !== 'string') return "So'rov noto'g'ri.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Yuklab olish manzili noto'g'ri.";
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return "Yuklab olish manzili noto'g'ri.";
  if (!DOWNLOAD_PATH.test(parsed.pathname) || parsed.search || parsed.username) return "Yuklab olish manzili noto'g'ri.";
  // O'rnatuvchini tekshiruvsiz ishga tushirmaymiz: sha256 majburiy.
  if (!SHA256.test(sha256.toLowerCase())) return 'Fayl nazorat yigʼindisi (sha256) yoʼq - oʼrnatilmaydi.';
  return { url: parsed, sha256: sha256.toLowerCase() };
}

/**
 * Yangi o'rnatuvchini Bola'dan yuklaydi, sha256 ni tekshiradi, jim (`/S`) ishga tushiradi va ilovani yopadi
 * (NSIS o'rnatuvchi eski nusxani almashtirib, yangisini o'zi ochadi). Faqat Windows.
 */
export async function installUpdate(
  url: unknown,
  sha256: unknown,
  onProgress: (percent: number) => void,
): Promise<InstallUpdateResult> {
  if (process.platform !== 'win32') return { ok: false, error: 'Avtomatik yangilash faqat Windows’da ishlaydi.' };
  const req = validateUpdateRequest(url, sha256);
  if (typeof req === 'string') return { ok: false, error: req };

  const dir = join(app.getPath('temp'), `pos-update-${randomBytes(6).toString('hex')}`);
  const file = join(dir, 'cashier-setup.exe');
  try {
    await mkdir(dir, { recursive: true });
    const response = await fetch(req.url, { signal: AbortSignal.timeout(15 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`Server ${response.status} qaytardi.`);
    const total = Number(response.headers.get('content-length')) || 0;

    const hash = createHash('sha256');
    let received = 0;
    let lastPct = -1;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        if (received > MAX_BYTES) return cb(new Error('Fayl juda katta.'));
        hash.update(chunk);
        if (total > 0) {
          const pct = Math.min(99, Math.floor((received / total) * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            onProgress(pct);
          }
        }
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body as never), meter, createWriteStream(file));

    if (hash.digest('hex') !== req.sha256) throw new Error('Fayl buzilgan (sha256 mos kelmadi).');
    onProgress(100);

    spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    // O'rnatuvchi ishlayotgan ilovani yopishni so'raydi - biz o'zimiz yopamiz.
    setTimeout(() => app.quit(), 500);
    return { ok: true };
  } catch (e) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, error: e instanceof Error ? e.message : 'Yuklab olishda xato.' };
  }
}
