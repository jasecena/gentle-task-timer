/**
 * How the app's notification slots are divided up.
 *
 * iOS keeps at most **64 pending local notifications per app** and silently
 * drops the rest — not 64 per feature, 64 in total. With two features wanting
 * slots (an interval run, a weekly schedule) that ceiling has to be shared
 * deliberately, or whichever one schedules last quietly goes missing.
 *
 * The split: a weekly schedule may claim up to {@link REMINDER_BUDGET}, leaving
 * the rest for whatever interval run is going. A run then takes what is
 * actually free at the time it starts.
 */

/** The platform ceiling. Not ours to raise. */
export const NOTIFICATION_LIMIT = 64;

/**
 * Slots a weekly schedule may claim.
 *
 * Deliberately short of the ceiling: a schedule repeats forever, so if it were
 * allowed all 64 it would permanently mute every interval run. The editor
 * refuses to save a schedule needing more than this, rather than accepting one
 * and dropping the overflow where nobody would see it.
 */
export const REMINDER_BUDGET = 48;

/** Cap on a single run's alerts when nothing else is pending — headroom under the ceiling. */
export const MAX_RUN_ALERTS = 60;

/**
 * Slots an interval run may use, given how many a schedule currently holds.
 *
 * A long run refills its window on every re-plan, so taking fewer slots costs
 * reach into the future rather than correctness.
 */
export function runAlertBudget(reminderSlots = 0): number {
  const claimed = Number.isFinite(reminderSlots) ? Math.max(0, Math.floor(reminderSlots)) : 0;
  return Math.max(0, Math.min(MAX_RUN_ALERTS, NOTIFICATION_LIMIT - claimed));
}
