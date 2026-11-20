import { describe, expect, it } from 'vitest';
import { elapsedLabel } from './time';

const now = Date.parse('2026-11-20T12:00:00Z');
describe('elapsedLabel', () => {
  it('daqiqa/soat formatlari', () => {
    expect(elapsedLabel('2026-11-20T11:59:40Z', now)).toBe('hozir');
    expect(elapsedLabel('2026-11-20T11:37:00Z', now)).toBe('23 daq');
    expect(elapsedLabel('2026-11-20T10:55:00Z', now)).toBe('1 soat 5 daq');
    expect(elapsedLabel('2026-11-20T10:00:00Z', now)).toBe('2 soat');
    expect(elapsedLabel('2026-11-13T09:00:00Z', now)).toBe('7 kun 3 soat');
    expect(elapsedLabel('2026-11-19T12:00:00Z', now)).toBe('1 kun');
  });
  it('kelajak va notoʼgʼri sana', () => {
    expect(elapsedLabel('2026-11-20T12:05:00Z', now)).toBe('hozir');
    expect(elapsedLabel('xato', now)).toBe('');
  });
});
