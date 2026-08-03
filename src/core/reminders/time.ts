import type { MinuteOfDay, Weekday } from './types';

/** Wall-clock helpers for the scheduling mode. No dates, no timezones, no locale. */

export const MINUTES_PER_DAY = 24 * 60;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function dayName(day: Weekday): string {
  return DAY_NAMES[day]!;
}

export function dayShortName(day: Weekday): string {
  return DAY_SHORT[day]!;
}

/** Single letter for the day toggles. Ambiguous by design — the row reads left to right from Sunday. */
export function dayInitial(day: Weekday): string {
  return DAY_INITIALS[day]!;
}

/** `540` → `"09:00"`. 24-hour, because it is unambiguous and sorts. */
export function formatClock(minuteOfDay: MinuteOfDay): string {
  const safe = clampMinute(minuteOfDay);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** Splits a minute-of-day into the hour/minute pair a calendar notification trigger needs. */
export function toClockParts(minuteOfDay: MinuteOfDay): { hour: number; minute: number } {
  const safe = clampMinute(minuteOfDay);
  return { hour: Math.floor(safe / 60), minute: safe % 60 };
}

/** Coerces anything into a valid minute of the day. */
export function clampMinute(minuteOfDay: number): MinuteOfDay {
  if (!Number.isFinite(minuteOfDay)) return 0;
  return Math.min(MINUTES_PER_DAY - 1, Math.max(0, Math.round(minuteOfDay)));
}

/**
 * Days in week order for display, always starting at Sunday.
 *
 * Sorting rather than trusting input order means two configs holding the same
 * days compare and render identically however they were built.
 */
export function sortDays(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

/** `"Mon–Fri"`, `"Sat, Sun"`, `"Every day"` — a summary line for the schedule. */
export function formatDays(days: readonly Weekday[]): string {
  const sorted = sortDays(days);
  if (sorted.length === 0) return 'No days';
  if (sorted.length === 7) return 'Every day';

  // Weekdays and weekends are common enough to be worth naming.
  const key = sorted.join(',');
  if (key === '1,2,3,4,5') return 'Mon–Fri';
  if (key === '0,6') return 'Sat, Sun';

  return sorted.map(dayShortName).join(', ');
}
