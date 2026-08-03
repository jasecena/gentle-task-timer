import { DEFAULT_CONFIG, LIMITS, isValidConfig, normalizeConfig, validateConfig } from '../config';
import type { TimerConfig } from '../types';

const config = (overrides: Partial<TimerConfig> = {}): TimerConfig => ({ ...DEFAULT_CONFIG, ...overrides });

describe('validateConfig', () => {
  it('accepts the default config', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
    expect(isValidConfig(DEFAULT_CONFIG)).toBe(true);
  });

  it('rejects a blank or whitespace-only name', () => {
    expect(validateConfig(config({ name: '   ' }))).toEqual([{ field: 'name', message: expect.any(String) }]);
  });

  it('rejects an over-long name', () => {
    const issues = validateConfig(config({ name: 'x'.repeat(LIMITS.MAX_NAME_LENGTH + 1) }));
    expect(issues.map((i) => i.field)).toEqual(['name']);
  });

  it.each([
    ['zero work duration', { workDurationMs: 0 }],
    ['sub-second work duration', { workDurationMs: 500 }],
    ['negative work duration', { workDurationMs: -1_000 }],
    ['work duration beyond 24h', { workDurationMs: LIMITS.MAX_WORK_MS + 1 }],
    ['fractional work duration', { workDurationMs: 1_500.5 }],
    ['NaN work duration', { workDurationMs: Number.NaN }],
    ['Infinite work duration', { workDurationMs: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_label, overrides) => {
    expect(validateConfig(config(overrides))).not.toEqual([]);
  });

  it('rejects a negative rest duration but allows zero', () => {
    expect(validateConfig(config({ restDurationMs: -1 }))).not.toEqual([]);
    expect(validateConfig(config({ restDurationMs: 0 }))).toEqual([]);
  });

  it.each([
    ['zero repeats', 0],
    ['negative repeats', -3],
    ['fractional repeats', 2.5],
    ['repeats beyond the cap', LIMITS.MAX_REPEATS + 1],
  ])('rejects %s', (_label, repeats) => {
    expect(validateConfig(config({ repeats }))).not.toEqual([]);
  });

  it('accepts vibration turned off, and any offered length', () => {
    expect(validateConfig(config({ vibrationMs: 0 }))).toEqual([]);
    expect(validateConfig(config({ vibrationMs: 10_000 }))).toEqual([]);
  });

  it.each([
    ['a buzz shorter than the phone can produce', 200],
    ['a buzz beyond ten seconds', 10_001],
    ['a fractional buzz', 2_500.5],
    ['a NaN buzz', Number.NaN],
  ])('rejects %s', (_label, vibrationMs) => {
    expect(validateConfig(config({ vibrationMs }))).not.toEqual([]);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const issues = validateConfig({ name: '', workDurationMs: 0, restDurationMs: -1, repeats: 0, vibrationMs: 50 });

    expect(issues.map((i) => i.field).sort()).toEqual([
      'name',
      'repeats',
      'restDurationMs',
      'vibrationMs',
      'workDurationMs',
    ]);
  });
});

describe('normalizeConfig', () => {
  it('always produces a config that passes validation', () => {
    const hostileInputs: Partial<TimerConfig>[] = [
      {},
      { workDurationMs: Number.NaN },
      { workDurationMs: -5, restDurationMs: -5, repeats: -5 },
      { workDurationMs: Number.POSITIVE_INFINITY, repeats: 10_000 },
      { name: '' },
      { name: 'y'.repeat(500) },
      { workDurationMs: 1_234.9, restDurationMs: 99.4 },
    ];

    for (const input of hostileInputs) {
      expect(validateConfig(normalizeConfig(input))).toEqual([]);
    }
    expect(validateConfig(normalizeConfig(null))).toEqual([]);
    expect(validateConfig(normalizeConfig(undefined))).toEqual([]);
  });

  it('clamps out-of-range values to the nearest limit', () => {
    const result = normalizeConfig({ workDurationMs: 0, restDurationMs: -100, repeats: 99_999 });

    expect(result.workDurationMs).toBe(LIMITS.MIN_WORK_MS);
    expect(result.restDurationMs).toBe(LIMITS.MIN_REST_MS);
    expect(result.repeats).toBe(LIMITS.MAX_REPEATS);
  });

  it('preserves values that are already valid', () => {
    const valid = config({ name: 'Pomodoro', workDurationMs: 1_500_000, restDurationMs: 300_000, repeats: 4 });

    expect(normalizeConfig(valid)).toEqual(valid);
  });

  it('trims and truncates the name, falling back to the default when empty', () => {
    expect(normalizeConfig({ name: '  Stretch  ' }).name).toBe('Stretch');
    expect(normalizeConfig({ name: '   ' }).name).toBe(DEFAULT_CONFIG.name);
    expect(normalizeConfig({ name: 'z'.repeat(200) }).name).toHaveLength(LIMITS.MAX_NAME_LENGTH);
  });
});
