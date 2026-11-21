import { describe, expect, it } from 'vitest';
import { durationLabel, elapsedLabel } from './time';

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

describe('durationLabel', () => {
  it('formatlar', () => {
    expect(durationLabel(0)).toBe('0 daq');
    expect(durationLabel(45)).toBe('45 daq');
    expect(durationLabel(60)).toBe('1 soat');
    expect(durationLabel(125)).toBe('2 soat 5 daq');
    expect(durationLabel(-5)).toBe('0 daq');
    expect(durationLabel(Number.NaN)).toBe('0 daq');
  });
});
