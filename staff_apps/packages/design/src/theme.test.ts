import { describe, expect, it } from 'vitest';

import { resolveTheme, textScaleFactor } from './theme';

const at = (h: number) => new Date(2026, 0, 1, h, 0, 0);

describe('resolveTheme', () => {
  it("aniq tanlov avto'dan ustun", () => {
    expect(resolveTheme('light', at(23))).toBe('light');
    expect(resolveTheme('night', at(12))).toBe('night');
  });

  it("avto: 19:00 dan 07:00 gacha tungi", () => {
    expect(resolveTheme('auto', at(18))).toBe('light');
    expect(resolveTheme('auto', at(19))).toBe('night');
    expect(resolveTheme('auto', at(2))).toBe('night');
    expect(resolveTheme('auto', at(6))).toBe('night');
    expect(resolveTheme('auto', at(7))).toBe('light');
  });
});

describe('textScaleFactor', () => {
  it("o'lchamlar o'sib boradi", () => {
    expect(textScaleFactor('normal')).toBe(1);
    expect(textScaleFactor('large')).toBeGreaterThan(1);
    expect(textScaleFactor('xlarge')).toBeGreaterThan(textScaleFactor('large'));
  });
});
