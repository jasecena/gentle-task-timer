/**
 * Wall-clock vocabulary: weekdays and minutes of the day. No dates, no
 * timezones, no locale, no `Date` at all.
 *
 * This started inside the scheduling domain and moved out when a second and
 * then a third feature needed the same words. A weekday and a minute of the day
 * are not "reminder" concepts — they are how this whole app talks about times
 * that recur, and keeping them free of any particular feature is what lets a
 * one-off note and a weekly schedule share the same picker and the same tests.
 *
 * The deliberate absence here is `Date`. A `MinuteOfDay` is a wall-clock time,
 * not an instant: 09:00 is 09:00 in whatever zone the phone is in, and the only
 * code that ever needs to resolve one to a real moment is the layer handing it
 * to iOS — which does it with a calendar trigger, in local time, correctly
 * across daylight saving. Keeping `Date` out of here is what makes every
 * function below trivially testable and impossible to get wrong by an hour.
 */

/** Day of the week, `Date.getDay()` convention: 0 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Minutes from midnight, 0..1439. Timezone-free by construction. */
export type MinuteOfDay = number;

export const MINUTES_PER_DAY = 24 * 60;
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

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

/** True for anything that is a usable weekday. The guard at every trust boundary. */
export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

/** Coerces anything into a weekday, falling back to `fallback`. */
export function normalizeWeekday(value: unknown, fallback: Weekday = 1): Weekday {
  return isWeekday(value) ? value : fallback;
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

/** `"Mon–Fri"`, `"Sat, Sun"`, `"Every day"` — a summary line for a set of days. */
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

/**
 * A position on the weekly grid, `0..10079`, counting from Sunday 00:00.
 *
 * Collapsing a weekday and a time into one number turns "how long until
 * Thursday at 15:00?" into subtraction, which is the entire trick behind the
 * one-off domain.
 */
export function weekMinute(weekday: Weekday, minuteOfDay: MinuteOfDay): number {
  return weekday * MINUTES_PER_DAY + clampMinute(minuteOfDay);
}

/**
 * Minutes from one point on the weekly grid to the next occurrence of another.
 *
 * Always `1..10080`, never zero: a one-off set for the minute it is being
 * created in belongs a week away, not this instant. Scheduling something for
 * "now" would have iOS deliver it immediately, which is not what anyone means
 * by picking a day and a time.
 */
export function minutesUntilNext(fromWeekMinute: number, toWeekMinute: number): number {
  const delta = (toWeekMinute - fromWeekMinute) % MINUTES_PER_WEEK;
  const forward = delta <= 0 ? delta + MINUTES_PER_WEEK : delta;
  return forward;
}

/** `"in 4m"`, `"in 3h 10m"`, `"in 2 days"` — how far off something is, for a list row. */
export function formatLeadTime(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  if (safe < 60) return `in ${safe}m`;

  const hours = Math.floor(safe / 60);
  if (hours < 24) {
    const rest = safe % 60;
    return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}
