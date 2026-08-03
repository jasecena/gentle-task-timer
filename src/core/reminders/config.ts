import { REMINDER_BUDGET } from '../alerts/budget';
import { normalizeVibrationMs, VIBRATION_LIMITS } from '../alerts/vibration';
import { countReminderSlots } from './plan';
import { clampMinute, MINUTES_PER_DAY, sortDays } from './time';
import type { ReminderConfig, Weekday } from './types';

/** Bounds for a schedule, and the reasons behind the unobvious ones. */
export const REMINDER_LIMITS = {
  /**
   * One minute. iOS refuses to repeat a notification more often than every 60
   * seconds, so anything shorter would simply never fire.
   */
  MIN_INTERVAL_MS: 60_000,
  /** Twelve hours — beyond this a "repeating" schedule is really a single daily alert. */
  MAX_INTERVAL_MS: 12 * 60 * 60 * 1_000,
  MIN_MINUTE: 0,
  MAX_MINUTE: MINUTES_PER_DAY - 1,
} as const;

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  enabled: false,
  intervalMs: 30 * 60_000,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  days: [1, 2, 3, 4, 5],
  vibrationMs: 3_000,
};

export interface ReminderIssue {
  /** `budget` is not a field the user edits directly — it is a property of the whole config. */
  readonly field: keyof ReminderConfig | 'budget';
  readonly message: string;
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

/**
 * Every problem with a candidate schedule, rather than just the first.
 *
 * The budget check is the one that matters most in practice: "every 30 minutes,
 * 9 to 5, five days" is 85 alerts a week, which is more than iOS will hold. It
 * is reported here, before saving, rather than discovered later as alerts that
 * quietly never arrive.
 */
export function validateReminderConfig(config: ReminderConfig): ReminderIssue[] {
  const issues: ReminderIssue[] = [];

  if (config.days.length === 0) {
    issues.push({ field: 'days', message: 'Pick at least one day.' });
  }

  if (!Number.isFinite(config.intervalMs) || config.intervalMs < REMINDER_LIMITS.MIN_INTERVAL_MS) {
    issues.push({ field: 'intervalMs', message: 'Alerts cannot repeat more often than once a minute.' });
  } else if (config.intervalMs > REMINDER_LIMITS.MAX_INTERVAL_MS) {
    issues.push({ field: 'intervalMs', message: 'Interval cannot exceed 12 hours.' });
  }

  if (config.endMinute < config.startMinute) {
    issues.push({ field: 'endMinute', message: 'End time must be at or after the start time.' });
  }

  if (config.vibrationMs !== VIBRATION_LIMITS.OFF_MS && config.vibrationMs < VIBRATION_LIMITS.MIN_ON_MS) {
    issues.push({ field: 'vibrationMs', message: 'Vibration must be off, or at least 1 second.' });
  } else if (config.vibrationMs > VIBRATION_LIMITS.MAX_MS) {
    issues.push({ field: 'vibrationMs', message: 'Vibration cannot exceed 10 seconds.' });
  }

  const slots = countReminderSlots(config);
  if (slots > REMINDER_BUDGET) {
    issues.push({
      field: 'budget',
      message: `${slots} alerts a week. iPhone allows ${REMINDER_BUDGET} — widen the interval or drop a day.`,
    });
  }

  return issues;
}

export function isValidReminderConfig(config: ReminderConfig): boolean {
  return validateReminderConfig(config).length === 0;
}

/**
 * Coerces arbitrary input — restored storage above all — into a structurally
 * sound config. Note this fixes *shape*, not *policy*: the result can still be
 * over budget, because silently dropping a day the user chose would be worse
 * than showing them the problem.
 */
export function normalizeReminderConfig(config: Partial<ReminderConfig> | null | undefined): ReminderConfig {
  const source = config ?? {};

  const interval = Number.isFinite(source.intervalMs)
    ? Math.min(
        REMINDER_LIMITS.MAX_INTERVAL_MS,
        Math.max(REMINDER_LIMITS.MIN_INTERVAL_MS, Math.round(source.intervalMs as number)),
      )
    : DEFAULT_REMINDER_CONFIG.intervalMs;

  const startMinute = clampMinute(source.startMinute ?? DEFAULT_REMINDER_CONFIG.startMinute);
  const rawEnd = clampMinute(source.endMinute ?? DEFAULT_REMINDER_CONFIG.endMinute);

  return {
    enabled: source.enabled === true,
    intervalMs: interval,
    startMinute,
    // An end before the start is a window that can never fire; pinning it to the
    // start degrades to a single daily alert, which is at least coherent.
    endMinute: Math.max(startMinute, rawEnd),
    days: sortDays(Array.isArray(source.days) ? source.days.filter(isWeekday) : DEFAULT_REMINDER_CONFIG.days),
    vibrationMs: normalizeVibrationMs(source.vibrationMs ?? DEFAULT_REMINDER_CONFIG.vibrationMs),
  };
}
