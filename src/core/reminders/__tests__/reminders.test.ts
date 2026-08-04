import { REMINDER_BUDGET } from '../../alerts/budget';
import {
  DEFAULT_REMINDER_CONFIG,
  isValidReminderConfig,
  normalizeReminderConfig,
  validateReminderConfig,
} from '../config';
import { countReminderSlots, planReminders, reminderTimesBetween, reminderTimesOfDay } from '../plan';
import { MINUTES_PER_DAY, weekMinute } from '../../clock';
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
  notifyWhenClosed: true,
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

describe('in-app mode', () => {
  const inApp = { ...WEEKDAYS_9_TO_5, notifyWhenClosed: false };

  /**
   * The whole point: a frequency the 64-slot budget could never afford, for nothing. "Every
   * five minutes, nine to five, weekdays" is 480 alerts a week and costs no slots, because
   * none are scheduled.
   */
  it('costs no notification slots at all', () => {
    expect(countReminderSlots(inApp)).toBe(0);
    expect(countReminderSlots({ ...inApp, intervalMs: 5 * 60_000 })).toBe(0);
  });

  it('hands iOS nothing, however it is armed', () => {
    expect(planReminders({ ...inApp, enabled: true })).toEqual([]);
  });

  it('lets a schedule the budget would refuse become valid', () => {
    // Every 5 minutes, 9-5, five days: 485 a week, hopeless as notifications.
    const dense = { ...inApp, intervalMs: 5 * 60_000 };

    expect(validateReminderConfig({ ...dense, notifyWhenClosed: true }).some((i) => i.field === 'budget')).toBe(true);
    expect(validateReminderConfig(dense)).toEqual([]);
  });

  it('still knows its times — they are what the in-app ticker walks', () => {
    expect(reminderTimesOfDay(inApp)).toHaveLength(9);
  });
});

describe('reminderTimesBetween', () => {
  const monday = (minute: number) => weekMinute(1, minute);

  /**
   * Same principle as the timer's `phasesEndingBetween`, and for the same reason: a tick that
   * arrives late must still report the times it stepped over, or a reminder is lost. On a
   * phone every tick arrives late.
   */
  it('reports a time the window stepped over', () => {
    const crossed = reminderTimesBetween(WEEKDAYS_9_TO_5, monday(9 * 60 - 1), monday(9 * 60 + 1));

    expect(crossed).toEqual([monday(9 * 60)]);
  });

  it('reports every time in a long window, in order', () => {
    // A five-hour gap — the app was open but the tick was starved.
    const crossed = reminderTimesBetween(WEEKDAYS_9_TO_5, monday(9 * 60), monday(14 * 60));

    expect(crossed).toEqual([10, 11, 12, 13, 14].map((h) => monday(h * 60)));
  });

  it('does not report a time the window opens exactly on', () => {
    // Open at the bottom, closed at the top: consecutive windows fire each time once.
    const first = reminderTimesBetween(WEEKDAYS_9_TO_5, monday(8 * 60), monday(9 * 60));
    const second = reminderTimesBetween(WEEKDAYS_9_TO_5, monday(9 * 60), monday(10 * 60));

    expect(first).toContain(monday(9 * 60));
    expect(second).not.toContain(monday(9 * 60));
    expect(second).toEqual([monday(10 * 60)]);
  });

  it('reports nothing outside the window or on an unscheduled day', () => {
    expect(reminderTimesBetween(WEEKDAYS_9_TO_5, monday(18 * 60), monday(20 * 60))).toEqual([]);
    // Sunday is not in Mon-Fri.
    expect(reminderTimesBetween(WEEKDAYS_9_TO_5, weekMinute(0, 9 * 60 - 1), weekMinute(0, 12 * 60))).toEqual([]);
  });

  it('crosses midnight and the end of the week without a special case', () => {
    const allDay = { ...WEEKDAYS_9_TO_5, days: [0, 1, 2, 3, 4, 5, 6] as const, startMinute: 0, endMinute: 0 };
    // Saturday 23:59 -> Sunday 00:01 wraps the grid.
    const crossed = reminderTimesBetween(
      { ...allDay, days: [...allDay.days] },
      weekMinute(6, MINUTES_PER_DAY - 1),
      weekMinute(0, 1),
    );

    expect(crossed).toEqual([weekMinute(0, 0)]);
  });

  it('reports nothing while the schedule is off', () => {
    expect(reminderTimesBetween({ ...WEEKDAYS_9_TO_5, enabled: false }, monday(0), monday(1439))).toEqual([]);
  });
});
