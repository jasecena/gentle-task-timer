import fc from 'fast-check';

import {
  clampMinute,
  dayInitial,
  dayName,
  dayShortName,
  formatClock,
  formatDays,
  formatLeadTime,
  isWeekday,
  MINUTES_PER_DAY,
  MINUTES_PER_WEEK,
  minutesUntilNext,
  normalizeWeekday,
  sortDays,
  toClockParts,
  WEEKDAYS,
  weekMinute,
  type Weekday,
} from '../week';

describe('day naming', () => {
  it('names every day, from Sunday', () => {
    expect(WEEKDAYS.map(dayName)[0]).toBe('Sunday');
    expect(dayName(6)).toBe('Saturday');
    expect(dayShortName(1)).toBe('Mon');
  });

  it('gives ambiguous initials, which is why the pickers carry full names too', () => {
    expect(WEEKDAYS.map(dayInitial)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  it('names the common groupings', () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Mon–Fri');
    expect(formatDays([0, 6])).toBe('Sat, Sun');
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(formatDays([2, 4])).toBe('Tue, Thu');
    expect(formatDays([])).toBe('No days');
  });

  it('sorts and deduplicates days from Sunday, whatever order they arrive in', () => {
    expect(sortDays([6, 0, 3])).toEqual([0, 3, 6]);
    expect(sortDays([3, 3, 3])).toEqual([3]);
  });
});

describe('weekday guards', () => {
  it('accepts only whole numbers in range', () => {
    expect(WEEKDAYS.every(isWeekday)).toBe(true);
    expect([7, -1, 1.5, Number.NaN, '1', null, undefined].some(isWeekday)).toBe(false);
  });

  it('falls back rather than producing an out-of-range day', () => {
    expect(normalizeWeekday(3)).toBe(3);
    expect(normalizeWeekday('tuesday')).toBe(1);
    expect(normalizeWeekday(99, 6)).toBe(6);
  });
});

describe('clock formatting', () => {
  it('formats a minute of the day as an unambiguous 24-hour clock', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9 * 60 + 5)).toBe('09:05');
    expect(formatClock(23 * 60 + 59)).toBe('23:59');
  });

  it('splits a minute into the parts a calendar trigger wants', () => {
    expect(toClockParts(9 * 60 + 5)).toEqual({ hour: 9, minute: 5 });
    expect(toClockParts(0)).toEqual({ hour: 0, minute: 0 });
  });

  it('clamps anything into a real minute of the day', () => {
    expect(clampMinute(-1)).toBe(0);
    expect(clampMinute(99_999)).toBe(MINUTES_PER_DAY - 1);
    expect(clampMinute(Number.NaN)).toBe(0);
    expect(clampMinute(10.6)).toBe(11);
  });
});

describe('the weekly grid', () => {
  it('places a weekday and time on one axis', () => {
    expect(weekMinute(0, 0)).toBe(0);
    expect(weekMinute(1, 0)).toBe(MINUTES_PER_DAY);
    expect(weekMinute(6, MINUTES_PER_DAY - 1)).toBe(MINUTES_PER_WEEK - 1);
  });

  it('measures forward to the next occurrence, wrapping the week', () => {
    const monday9 = weekMinute(1, 9 * 60);
    const thursday15 = weekMinute(4, 15 * 60);

    expect(minutesUntilNext(monday9, thursday15)).toBe(3 * MINUTES_PER_DAY + 6 * 60);
    // Backwards on the grid means next week, not a negative answer.
    expect(minutesUntilNext(thursday15, monday9)).toBe(MINUTES_PER_WEEK - (3 * MINUTES_PER_DAY + 6 * 60));
  });

  /**
   * The edge that decides what "this minute" means. A note created at 15:00 for
   * 15:00 belongs a week away — scheduling it for right now would have iOS
   * deliver it immediately, which is not what picking a day and time means.
   */
  it('treats the current minute as a full week away, never as now', () => {
    const point = weekMinute(3, 12 * 60);

    expect(minutesUntilNext(point, point)).toBe(MINUTES_PER_WEEK);
  });

  it('is always a positive number of minutes within one week', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MINUTES_PER_WEEK - 1 }),
        fc.integer({ min: 0, max: MINUTES_PER_WEEK - 1 }),
        (from, to) => {
          const delta = minutesUntilNext(from, to);

          expect(delta).toBeGreaterThan(0);
          expect(delta).toBeLessThanOrEqual(MINUTES_PER_WEEK);
          // Landing on the target is the whole contract.
          expect((from + delta) % MINUTES_PER_WEEK).toBe(to);
        },
      ),
    );
  });
});

describe('formatLeadTime', () => {
  it('reads in the largest useful unit', () => {
    expect(formatLeadTime(0)).toBe('in 0m');
    expect(formatLeadTime(45)).toBe('in 45m');
    expect(formatLeadTime(60)).toBe('in 1h');
    expect(formatLeadTime(190)).toBe('in 3h 10m');
    expect(formatLeadTime(24 * 60)).toBe('in 1 day');
    expect(formatLeadTime(3 * 24 * 60 + 90)).toBe('in 3 days');
  });

  it('never produces a negative or nonsense lead', () => {
    expect(formatLeadTime(-100)).toBe('in 0m');
    expect(formatLeadTime(Number.NaN)).toBe('in 0m');
  });
});

describe('the whole vocabulary', () => {
  it('round-trips any weekday and minute through the grid', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WEEKDAYS), fc.integer({ min: 0, max: MINUTES_PER_DAY - 1 }), (day, minute) => {
        const point = weekMinute(day, minute);

        expect(Math.floor(point / MINUTES_PER_DAY)).toBe(day);
        expect(point % MINUTES_PER_DAY).toBe(minute);
      }),
    );
  });

  it('formats every minute of every day as a well-formed clock', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MINUTES_PER_DAY - 1 }), (minute) => {
        expect(formatClock(minute)).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      }),
    );
  });

  it('names any set of days without throwing', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...WEEKDAYS)), (days: Weekday[]) => {
        expect(typeof formatDays(days)).toBe('string');
      }),
    );
  });
});
