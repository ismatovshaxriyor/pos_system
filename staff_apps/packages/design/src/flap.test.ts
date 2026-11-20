import { describe, expect, it } from 'vitest';

import { flapCells } from './flap';

describe('flapCells', () => {
  it("minglar orasidagi bo'shliq gap bo'ladi", () => {
    expect(flapCells('92 000').map((c) => (c.gap ? '_' : c.ch)).join('')).toBe('92_000');
  });

  it('qattiq bo\'shliq (NBSP) ham gap', () => {
    expect(flapCells('8 000').map((c) => c.gap)).toEqual([false, true, false, false, false]);
  });

  it("manfiy ishora va chetdagi bo'shliqlar", () => {
    expect(flapCells(' -5 000 ').map((c) => (c.gap ? '_' : c.ch)).join('')).toBe('-5_000');
  });
});
