/**
 * Public surface of the scheduling domain.
 *
 * UI code imports from `@/core/reminders` and never from the modules inside, so
 * the internals stay free to move. The wall-clock helpers are re-exported from
 * `@/core/clock`, which is where they moved once the one-off domain needed the
 * same vocabulary — callers here were not affected by that.
 */
export type { ReminderConfig, ReminderSlot } from './types';
export type { MinuteOfDay, Weekday } from '../clock';

export {
  DEFAULT_REMINDER_CONFIG,
  isValidReminderConfig,
  normalizeReminderConfig,
  REMINDER_LIMITS,
  validateReminderConfig,
} from './config';
export type { ReminderIssue } from './config';

export { countReminderSlots, planReminders, reminderTimesBetween, reminderTimesOfDay } from './plan';

export {
  clampMinute,
  dayInitial,
  dayName,
  dayShortName,
  formatClock,
  formatDays,
  MINUTES_PER_DAY,
  sortDays,
  toClockParts,
  WEEKDAYS,
} from '../clock';
