/**
 * The scheduling mode: recurring alerts inside a window, on chosen weekdays.
 *
 * Where the interval timer models *a run you start*, this models *a standing
 * arrangement* — "every 30 minutes between 9 and 5, weekdays". Nothing here
 * counts down and nothing needs the app to be open: the whole thing resolves to
 * a set of weekly-repeating local notifications that iOS delivers on its own.
 *
 * Pure TypeScript, like everything under `src/core`.
 */

/** Day of the week, `Date.getDay()` convention: 0 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Minutes from midnight, 0..1439. Timezone-free by construction — it is a wall-clock time, not an instant. */
export type MinuteOfDay = number;

export interface ReminderConfig {
  /** Whether the schedule is currently armed. Turning it off cancels every pending alert. */
  readonly enabled: boolean;
  /** Gap between alerts inside the window. */
  readonly intervalMs: number;
  /** First alert of the day. */
  readonly startMinute: MinuteOfDay;
  /** No alert fires after this. */
  readonly endMinute: MinuteOfDay;
  /** Days the schedule runs. Empty means it can never fire. */
  readonly days: readonly Weekday[];
  /**
   * How long the phone buzzes when an alert arrives while the app is open, in
   * ms. Zero turns vibration off. With the app closed the notification gets
   * iOS's own single buzz, which no setting can lengthen.
   */
  readonly vibrationMs: number;
}

/**
 * One recurring alert: a weekday and a wall-clock time.
 *
 * There is no date here on purpose. Each slot becomes a *repeating* weekly
 * notification, so the arrangement survives with the app closed indefinitely —
 * as opposed to a list of dated alerts, which would run out and need the app to
 * be opened to top up.
 */
export interface ReminderSlot {
  /** Stable identity, so re-scheduling replaces rather than duplicates. */
  readonly key: string;
  readonly weekday: Weekday;
  readonly minuteOfDay: MinuteOfDay;
  /** 0..23, as iOS's calendar trigger wants it. */
  readonly hour: number;
  /** 0..59. */
  readonly minute: number;
  readonly title: string;
  readonly body: string;
}
