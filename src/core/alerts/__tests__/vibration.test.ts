import {
  buildVibrationPattern,
  formatVibrationLabel,
  normalizeVibrationMs,
  PULSE_MS,
  stepVibrationMs,
  VIBRATION_LIMITS,
  vibrationPatternDurationMs,
} from '../vibration';

describe('normalizeVibrationMs', () => {
  it('treats zero and anything below it as off', () => {
    expect(normalizeVibrationMs(0)).toBe(0);
    expect(normalizeVibrationMs(-5_000)).toBe(0);
  });

  it('rounds a too-short setting up to the shortest usable buzz', () => {
    expect(normalizeVibrationMs(200)).toBe(VIBRATION_LIMITS.MIN_ON_MS);
  });

  it('caps at ten seconds', () => {
    expect(normalizeVibrationMs(60_000)).toBe(VIBRATION_LIMITS.MAX_MS);
  });

  it('treats junk as off rather than guessing', () => {
    expect(normalizeVibrationMs(Number.NaN)).toBe(0);
    expect(normalizeVibrationMs(undefined)).toBe(0);
    expect(normalizeVibrationMs(null)).toBe(0);
  });
});

describe('buildVibrationPattern', () => {
  it('produces nothing when vibration is off', () => {
    expect(buildVibrationPattern(0)).toEqual([]);
    expect(buildVibrationPattern(-1)).toEqual([]);
  });

  it('starts with an immediate buzz', () => {
    expect(buildVibrationPattern(3_000)[0]).toBe(0);
  });

  it('never runs longer than the requested duration', () => {
    for (const duration of [1_000, 2_000, 3_000, 5_000, 7_500, 10_000]) {
      for (const rhythm of ['single', 'double', 'triple'] as const) {
        const pattern = buildVibrationPattern(duration, rhythm);
        expect(vibrationPatternDurationMs(pattern)).toBeLessThanOrEqual(duration);
      }
    }
  });

  it('fills most of the duration rather than stopping early', () => {
    // Within one buzz-plus-gap of the target: the train stops when the next
    // buzz would overrun, so the shortfall is bounded by a single cycle.
    for (const duration of [3_000, 5_000, 10_000]) {
      const used = vibrationPatternDurationMs(buildVibrationPattern(duration, 'single'));
      expect(duration - used).toBeLessThan(PULSE_MS * 2 + 400);
    }
  });

  it('buzzes longer when asked for longer', () => {
    const short = buildVibrationPattern(1_000);
    const medium = buildVibrationPattern(5_000);
    const long = buildVibrationPattern(10_000);

    expect(medium.length).toBeGreaterThan(short.length);
    expect(long.length).toBeGreaterThan(medium.length);
  });

  it('gives each rhythm a different feel at the same duration', () => {
    const single = buildVibrationPattern(5_000, 'single');
    const double = buildVibrationPattern(5_000, 'double');
    const triple = buildVibrationPattern(5_000, 'triple');

    expect(single).not.toEqual(double);
    expect(double).not.toEqual(triple);
    // The stutters pack more buzzes into the same time than the even one.
    expect(double.length).toBeGreaterThanOrEqual(single.length);
  });

  it('caps a wild duration at the ten-second setting', () => {
    expect(buildVibrationPattern(120_000)).toEqual(buildVibrationPattern(VIBRATION_LIMITS.MAX_MS));
  });

  it('always fits at least one buzz once it is on', () => {
    expect(buildVibrationPattern(VIBRATION_LIMITS.MIN_ON_MS)).toEqual([0]);
  });
});

describe('stepVibrationMs', () => {
  it('walks up and down the offered settings', () => {
    expect(stepVibrationMs(0, 1)).toBe(1_000);
    expect(stepVibrationMs(1_000, 1)).toBe(3_000);
    expect(stepVibrationMs(3_000, -1)).toBe(1_000);
  });

  it('stops at both ends rather than wrapping around', () => {
    expect(stepVibrationMs(0, -1)).toBe(0);
    expect(stepVibrationMs(VIBRATION_LIMITS.MAX_MS, 1)).toBe(VIBRATION_LIMITS.MAX_MS);
  });

  it('snaps an unrecognised stored value onto the nearest option', () => {
    expect(stepVibrationMs(4_800, 1)).toBe(VIBRATION_LIMITS.MAX_MS);
    expect(stepVibrationMs(4_800, -1)).toBe(3_000);
  });

  it('reaches off from the shortest buzz, so vibration can always be turned off', () => {
    expect(stepVibrationMs(1_000, -1)).toBe(VIBRATION_LIMITS.OFF_MS);
  });
});

describe('formatVibrationLabel', () => {
  it('names the off setting rather than showing a zero', () => {
    expect(formatVibrationLabel(0)).toBe('Off');
  });

  it('reads in whole seconds', () => {
    expect(formatVibrationLabel(3_000)).toBe('3s');
    expect(formatVibrationLabel(10_000)).toBe('10s');
  });
});
