import { REMINDER_BUDGET } from '../../alerts/budget';
import {
  DEFAULT_REMINDER_CONFIG,
  isValidReminderConfig,
  normalizeReminderConfig,
  validateReminderConfig,
} from '../config';
import { countReminderSlots, planReminders, reminderTimesOfDay } from '../plan';
import type { ReminderConfig } from '../types';

const WEEKDAYS_9_TO_5: ReminderConfig = {
  enabled: true,
  intervalMs: 60 * 60_000, // hourly
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  days: [1, 2, 3, 4, 5],
  vibrationMs: 3_000,
  soundId: 'default',
  ringMs: 1_500,
};

describe('reminderTimesOfDay', () => {
  it('includes both ends of the window', () => {
    const times = reminderTimesOfDay(WEEKDAYS_9_TO_5);

    expect(times[0]).toBe(9 * 60);
    expect(times[times.length - 1]).toBe(17 * 60);
    expect(times).toHaveLength(9); // 09:00 through 17:00 inclusive
  });

  it('stops before overshooting the end', () => {
    // 09:00–17:00 every 90 minutes: 9:00, 10:30, ... 16:30, and 18:00 is past the end.
    const times = reminderTimesOfDay({ ...WEEKDAYS_9_TO_5, intervalMs: 90 * 60_000 });

    expect(times[times.length - 1]).toBe(16 * 60 + 30);
  });

  it('gives a single alert when the interval is wider than the window', () => {
    expect(reminderTimesOfDay({ ...WEEKDAYS_9_TO_5, intervalMs: 12 * 60 * 60_000 })).toEqual([9 * 60]);
  });

  it('gives a single alert when start and end are the same minute', () => {
    expect(reminderTimesOfDay({ ...WEEKDAYS_9_TO_5, endMinute: 9 * 60 })).toEqual([9 * 60]);
  });

  it('refuses a backwards window', () => {
    expect(reminderTimesOfDay({ ...WEEKDAYS_9_TO_5, startMinute: 17 * 60, endMinute: 9 * 60 })).toEqual([]);
  });
});

describe('countReminderSlots', () => {
  it('multiplies times of day by days of week', () => {
    expect(countReminderSlots(WEEKDAYS_9_TO_5)).toBe(9 * 5);
  });

  it('counts nothing without a day', () => {
    expect(countReminderSlots({ ...WEEKDAYS_9_TO_5, days: [] })).toBe(0);
  });

  it('counts a disabled schedule, because the cost is what the editor is previewing', () => {
    expect(countReminderSlots({ ...WEEKDAYS_9_TO_5, enabled: false })).toBe(45);
  });

  it('ignores a day listed twice', () => {
    expect(countReminderSlots({ ...WEEKDAYS_9_TO_5, days: [1, 1, 2] })).toBe(18);
  });
});

describe('planReminders', () => {
  it('produces one weekly-repeating slot per day per time', () => {
    const slots = planReminders(WEEKDAYS_9_TO_5);

    expect(slots).toHaveLength(45);
    expect(slots[0]).toMatchObject({ weekday: 1, hour: 9, minute: 0, title: 'Reminder' });
  });

  it('tells each alert when the next one is coming, and marks the last', () => {
    const slots = planReminders({ ...WEEKDAYS_9_TO_5, days: [1] });

    expect(slots[0]!.body).toBe('Next at 10:00');
    expect(slots[slots.length - 1]!.body).toBe('Last one today');
  });

  it('plans nothing while the schedule is off', () => {
    expect(planReminders({ ...WEEKDAYS_9_TO_5, enabled: false })).toEqual([]);
  });

  it('plans nothing with no days selected', () => {
    expect(planReminders({ ...WEEKDAYS_9_TO_5, days: [] })).toEqual([]);
  });

  it('keys slots uniquely and stably, so rescheduling replaces rather than duplicates', () => {
    const keys = planReminders(WEEKDAYS_9_TO_5).map((slot) => slot.key);
    const again = planReminders(WEEKDAYS_9_TO_5).map((slot) => slot.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(again).toEqual(keys);
  });

  it('orders slots by day then time', () => {
    const slots = planReminders({ ...WEEKDAYS_9_TO_5, days: [5, 1] });

    expect(slots[0]!.weekday).toBe(1);
    expect(slots[slots.length - 1]!.weekday).toBe(5);
  });
});

describe('validateReminderConfig', () => {
  it('accepts a schedule that fits', () => {
    expect(isValidReminderConfig(WEEKDAYS_9_TO_5)).toBe(true);
  });

  it('rejects the classic over-budget case with a number the user can act on', () => {
    // Every 30 minutes, 9–5, five days: 85 alerts a week.
    const issues = validateReminderConfig({ ...WEEKDAYS_9_TO_5, intervalMs: 30 * 60_000 });
    const budget = issues.find((issue) => issue.field === 'budget');

    expect(budget?.message).toContain('85 alerts a week');
    expect(budget?.message).toContain(String(REMINDER_BUDGET));
  });

  it('rejects a schedule with no days', () => {
    expect(validateReminderConfig({ ...WEEKDAYS_9_TO_5, days: [] })).toContainEqual({
      field: 'days',
      message: 'Pick at least one day.',
    });
  });

  it('rejects an interval iOS would refuse to repeat', () => {
    const issues = validateReminderConfig({ ...WEEKDAYS_9_TO_5, intervalMs: 30_000 });

    expect(issues.map((issue) => issue.field)).toContain('intervalMs');
  });

  it('rejects a backwards window', () => {
    const issues = validateReminderConfig({ ...WEEKDAYS_9_TO_5, startMinute: 17 * 60, endMinute: 9 * 60 });

    expect(issues.map((issue) => issue.field)).toContain('endMinute');
  });

  it('rejects an interval so wide it is no longer a repeating schedule', () => {
    const issues = validateReminderConfig({ ...WEEKDAYS_9_TO_5, intervalMs: 13 * 60 * 60_000 });

    expect(issues.map((issue) => issue.field)).toContain('intervalMs');
  });

  it('accepts vibration turned off, and rejects lengths the phone cannot produce', () => {
    expect(validateReminderConfig({ ...WEEKDAYS_9_TO_5, vibrationMs: 0 })).toEqual([]);
    expect(validateReminderConfig({ ...WEEKDAYS_9_TO_5, vibrationMs: 200 }).map((i) => i.field)).toEqual([
      'vibrationMs',
    ]);
    expect(validateReminderConfig({ ...WEEKDAYS_9_TO_5, vibrationMs: 10_001 }).map((i) => i.field)).toEqual([
      'vibrationMs',
    ]);
  });

  it('rejects a voice that is not in the catalogue', () => {
    // A filename iOS cannot resolve is delivered silently, which reads as a
    // broken alert rather than a missing sound.
    expect(validateReminderConfig({ ...WEEKDAYS_9_TO_5, soundId: 'gong' }).map((i) => i.field)).toEqual(['soundId']);
  });

  it('reports every problem at once rather than the first', () => {
    const issues = validateReminderConfig({ ...WEEKDAYS_9_TO_5, days: [], intervalMs: 1_000 });

    expect(issues.length).toBeGreaterThan(1);
  });
});

describe('normalizeReminderConfig', () => {
  it('falls back to the default schedule for missing input', () => {
    expect(normalizeReminderConfig(null)).toEqual({ ...DEFAULT_REMINDER_CONFIG, enabled: false });
  });

  it('survives hostile input', () => {
    const config = normalizeReminderConfig({
      enabled: 'yes' as unknown as boolean,
      intervalMs: Number.NaN,
      startMinute: -400,
      endMinute: 99_999,
      days: [1, 9, -2, 'tuesday'] as unknown as ReminderConfig['days'],
    });

    expect(config.enabled).toBe(false);
    expect(config.startMinute).toBe(0);
    expect(config.endMinute).toBe(24 * 60 - 1);
    expect(config.days).toEqual([1]);
    expect(config.intervalMs).toBe(DEFAULT_REMINDER_CONFIG.intervalMs);
  });

  it('pins an end before the start to the start, leaving one daily alert', () => {
    const config = normalizeReminderConfig({ startMinute: 600, endMinute: 300 });

    expect(config.endMinute).toBe(600);
    expect(reminderTimesOfDay(config)).toHaveLength(1);
  });

  it('does not quietly fix an over-budget schedule', () => {
    // Dropping a day the user picked would be worse than reporting the problem.
    const config = normalizeReminderConfig({ ...WEEKDAYS_9_TO_5, intervalMs: 60_000 });

    expect(isValidReminderConfig(config)).toBe(false);
  });

  it('sorts and deduplicates days', () => {
    expect(normalizeReminderConfig({ days: [5, 1, 5, 0] }).days).toEqual([0, 1, 5]);
  });
});
