import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Token kabi maxfiy qiymatlar uchun shifrlangan fayl. Qiymatlar `safeStorage`
 * (Windows'da DPAPI - joriy Windows foydalanuvchisiga bog'langan) bilan shifrlanadi,
 * faylda base64 ko'rinishida yotadi.
 *
 * Shifrlash mavjud bo'lmasa (`isEncryptionAvailable() === false`) ochiq matn bilan
 * JIM zaxiraga O'TMAYMIZ - xato tashlaymiz, ilova token saqlay olmaydi va har safar
 * PIN so'raydi. Bu kassa uchun xavfsiz tomon.
 */
function filePath(): string {
  return join(app.getPath('userData'), 'secure.json');
}

function readAll(): Record<string, string> {
  const p = filePath();
  if (!existsSync(p)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {}; // buzilgan fayl - qayta kirish kerak, ilova yiqilmasin
  }
}

function writeAll(data: Record<string, string>): void {
  const p = filePath();
  mkdirSync(dirname(p), { recursive: true });
  // Atomik yozish: elektr o'chsa (kassada tez-tez) yarim yozilgan fayl qolmasin.
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  renameSync(tmp, p);
}

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Shifrlangan saqlash mavjud emas.');
  }
}

export function secureGet(key: string): string | null {
  const stored = readAll()[key];
  if (!stored) return null;
  assertEncryption();
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return null; // boshqa Windows foydalanuvchisi/mashinada shifrlangan - yaroqsiz
  }
}

export function secureSet(key: string, value: string): void {
  assertEncryption();
  const all = readAll();
  all[key] = safeStorage.encryptString(value).toString('base64');
  writeAll(all);
}

export function secureRemove(key: string): void {
  const all = readAll();
  if (key in all) {
    delete all[key];
    writeAll(all);
  }
}
