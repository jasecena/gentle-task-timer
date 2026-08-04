import {
  formatClock,
  MINUTES_PER_WEEK,
  minutesUntilNext,
  sortDays,
  toClockParts,
  weekMinute,
  type MinuteOfDay,
} from '../clock';
import type { ReminderConfig, ReminderSlot } from './types';

/**
 * Expanding a schedule into the alerts it implies.
 *
 * The expansion is deliberately a pure function of the config — the same
 * arrangement always produces the same slots, in the same order, with the same
 * keys — so scheduling is idempotent and the editor can count the cost of a
 * change before committing to it.
 */

/**
 * The times of day a schedule fires, first to last.
 *
 * The window is inclusive at both ends: a 09:00–17:00 schedule every hour fires
 * at 17:00 as well, because a user who says "until 5" means "and at 5", not
 * "and then stop just before". An interval wider than the window still gives
 * one alert, at the start.
 */
export function reminderTimesOfDay(config: ReminderConfig): MinuteOfDay[] {
  const intervalMinutes = Math.floor(config.intervalMs / 60_000);
  if (intervalMinutes <= 0) return [];
  if (config.endMinute < config.startMinute) return [];

  const times: MinuteOfDay[] = [];
  for (let minute = config.startMinute; minute <= config.endMinute; minute += intervalMinutes) {
    times.push(minute);
  }
  return times;
}

/**
 * Alerts a schedule occupies in a week — what the 64-notification budget is spent on.
 *
 * Zero in in-app mode, and not as a special case: nothing is handed to iOS, so nothing is
 * pending. That is also what lets the budget validation pass for a frequency it could never
 * otherwise allow — the check is against slots used, and an in-app schedule uses none.
 */
export function countReminderSlots(config: ReminderConfig): number {
  if (!config.notifyWhenClosed) return 0;
  if (config.days.length === 0) return 0;
  return reminderTimesOfDay(config).length * new Set(config.days).size;
}

/**
 * Every alert the schedule implies, as weekly-repeating slots.
 *
 * A disabled schedule plans nothing, which is what makes "off" and "on with no
 * days" behave identically to the layer that talks to the OS: it is handed an
 * empty list and cancels everything.
 */
export function planReminders(config: ReminderConfig): ReminderSlot[] {
  if (!config.enabled) return [];
  // In-app mode hands iOS nothing. The times still exist — `reminderTimesOfDay` is what the
  // in-app ticker walks — but no notification is ever scheduled for them.
  if (!config.notifyWhenClosed) return [];

  const days = sortDays(config.days);
  const times = reminderTimesOfDay(config);
  if (days.length === 0 || times.length === 0) return [];

  const slots: ReminderSlot[] = [];
  for (const weekday of days) {
    times.forEach((minuteOfDay, index) => {
      const next = times[index + 1];
      slots.push({
        key: `reminder-${weekday}-${minuteOfDay}`,
        weekday,
        minuteOfDay,
        ...toClockParts(minuteOfDay),
        title: 'Reminder',
        body: next === undefined ? 'Last one today' : `Next at ${formatClock(next)}`,
        soundId: config.soundId,
        ringMs: config.ringMs,
        vibrationMs: config.vibrationMs,
      });
    });
  }
  return slots;
}

/**
 * The reminder times crossed in the wall-clock window `(from, to]`.
 *
 * The in-app half of the feature, and deliberately the same shape as the timer's
 * `phasesEndingBetween`: alerts fire off *windows*, never off a per-tick "is it exactly now?"
 * check. A tick that arrives late — and on a phone they all do — must still report the times
 * it stepped over, or a reminder is simply lost.
 *
 * Both bounds are minutes on the weekly grid, so a window that crosses midnight or the end of
 * the week works without special cases. Open at the bottom and closed at the top, so feeding
 * consecutive windows fires each time exactly once.
 */
export function reminderTimesBetween(config: ReminderConfig, fromWeekMinute: number, toWeekMinute: number): number[] {
  if (!config.enabled) return [];

  const days = sortDays(config.days);
  const times = reminderTimesOfDay(config);
  if (days.length === 0 || times.length === 0) return [];

  const span = minutesUntilNext(fromWeekMinute, toWeekMinute);
  // A window of a whole week or more would report everything twice over; nothing legitimate
  // produces one, and clamping is cheaper than reasoning about what it should mean.
  const width = Math.min(span, MINUTES_PER_WEEK);

  const crossed: number[] = [];
  for (const day of days) {
    for (const time of times) {
      const point = weekMinute(day, time);
      // How far past `from` this point sits, in the same direction the window runs.
      const offset = minutesUntilNext(fromWeekMinute, point);
      if (offset <= width) crossed.push(point);
    }
  }

  return crossed.sort((a, b) => minutesUntilNext(fromWeekMinute, a) - minutesUntilNext(fromWeekMinute, b));
}
