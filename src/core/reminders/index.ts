/**
 * Public surface of the scheduling domain.
 *
 * UI code imports from `@/core/reminders` and never from the modules inside, so
 * the internals stay free to move.
 */
export type { MinuteOfDay, ReminderConfig, ReminderSlot, Weekday } from './types';
export { WEEKDAYS } from './types';

export {
  DEFAULT_REMINDER_CONFIG,
  isValidReminderConfig,
  normalizeReminderConfig,
  REMINDER_LIMITS,
  validateReminderConfig,
} from './config';
export type { ReminderIssue } from './config';

export { countReminderSlots, planReminders, reminderTimesOfDay } from './plan';

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
} from './time';
