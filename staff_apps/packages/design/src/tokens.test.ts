import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { light, night, type Palette } from './tokens';

/** TS kalit → CSS o'zgaruvchi nomi */
const CSS_VAR: Record<keyof Palette, string> = {
  paper: '--paper',
  panel: '--panel',
  card: '--card',
  sel: '--sel',
  ink: '--ink',
  ink60: '--ink-60',
  grid: '--grid',
  edge: '--edge',
  signal: '--signal',
  onSignal: '--on-signal',
  ok: '--ok',
  okSoft: '--ok-soft',
  warn: '--warn',
  warnSoft: '--warn-soft',
  warnInk: '--warn-ink',
  dim: '--dim',
  banner: '--banner',
  onBanner: '--on-banner',
};

const css = readFileSync(resolve(__dirname, '../tokens.css'), 'utf8');

/** `:root[data-theme='<name>'] { ... }` blokining ichi (light uchun `:root,` bilan boshlanadi). */
function block(selectorStart: string): string {
  const start = css.indexOf(selectorStart);
  expect(start, `${selectorStart} topilmadi`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

function declared(blockText: string, name: string): string | undefined {
  const m = new RegExp(`${name.replace(/-/g, '\\-')}:\\s*([^;]+);`).exec(blockText);
  return m?.[1]?.trim();
}

describe.each([
  ['light', light, ":root,\n:root[data-theme='light']"],
  ['night', night, ":root[data-theme='night']"],
] as const)('tokens.css %s mavzu tokens.ts bilan mos', (_name, palette, selector) => {
  const text = block(selector);
  for (const key of Object.keys(CSS_VAR) as (keyof Palette)[]) {
    it(`${key}`, () => {
      expect(declared(text, CSS_VAR[key])?.toLowerCase()).toBe(palette[key].toLowerCase());
    });
  }
});
