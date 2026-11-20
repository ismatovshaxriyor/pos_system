import { describe, expect, it } from 'vitest';

import { compareVersions, mustUpdate, needsUpdate, type AppUpdateInfo } from './appupdate';

const info = (over: Partial<AppUpdateInfo> = {}, version = '1.2.0'): AppUpdateInfo => ({
  available: true,
  required: false,
  latest: { slug: 'kassir', version, size_mb: '1', sha256: 'x', notes: [], download_url: '/d' },
  ...over,
});

describe('compareVersions', () => {
  it('raqamli solishtiradi', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
  });
  it("bo'sh versiya eng eskisi", () => {
    expect(compareVersions('0.0.1', '')).toBe(1);
  });
});

describe('needsUpdate / mustUpdate', () => {
  it("yangi versiya bo'lsa kerak", () => {
    expect(needsUpdate(info(), '1.0.0')).toBe(true);
    expect(mustUpdate(info({ required: true }), '1.0.0')).toBe(true);
  });
  it("server 'available' desa ham, o'zimiz eskirmaganini tekshiramiz", () => {
    expect(needsUpdate(info(), '1.2.0')).toBe(false);
    expect(mustUpdate(info({ required: true }), '1.3.0')).toBe(false);
  });
  it("ixtiyoriy yangilanish bloklamaydi, null xavfsiz", () => {
    expect(mustUpdate(info(), '1.0.0')).toBe(false);
    expect(needsUpdate(null, '1.0.0')).toBe(false);
  });
});
