import { formatDuration, formatDurationLabel, fromParts, toParts } from '../format';

describe('formatDuration', () => {
  it('pads to mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5_000)).toBe('00:05');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('widens to h:mm:ss only past an hour', () => {
    expect(formatDuration(3_599_000)).toBe('59:59');
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(7_265_000)).toBe('2:01:05');
  });

  it('rounds up so a countdown shows the second it is currently in', () => {
    // With 4.2s left the user is inside the 5th-to-last second, so "00:05" is
    // correct; rounding down would show "00:04" a beat early and would sit on
    // "00:00" for a full second before firing.
    expect(formatDuration(4_200)).toBe('00:05');
    expect(formatDuration(1)).toBe('00:01');
    expect(formatDuration(999)).toBe('00:01');
    expect(formatDuration(1_000)).toBe('00:01');
    expect(formatDuration(1_001)).toBe('00:02');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatDuration(-5_000)).toBe('00:00');
    expect(formatDuration(Number.NaN)).toBe('00:00');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});

describe('formatDurationLabel', () => {
  it('omits empty units', () => {
    expect(formatDurationLabel(45_000)).toBe('45s');
    expect(formatDurationLabel(150_000)).toBe('2m 30s');
    expect(formatDurationLabel(120_000)).toBe('2m');
    expect(formatDurationLabel(3_900_000)).toBe('1h 5m');
    expect(formatDurationLabel(0)).toBe('0s');
  });
});

describe('toParts / fromParts', () => {
  it('splits a duration into hours, minutes and seconds', () => {
    expect(toParts(7_265_000)).toEqual({ hours: 2, minutes: 1, seconds: 5 });
    expect(toParts(0)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });

  it('round-trips any whole-second duration', () => {
    for (const ms of [0, 1_000, 59_000, 60_000, 3_600_000, 7_265_000, 86_399_000]) {
      expect(fromParts(toParts(ms))).toBe(ms);
    }
  });

  it('treats missing or non-finite parts as zero', () => {
    expect(fromParts({})).toBe(0);
    expect(fromParts({ minutes: 2 })).toBe(120_000);
    expect(fromParts({ hours: Number.NaN, minutes: 1, seconds: -5 })).toBe(60_000);
  });
});
