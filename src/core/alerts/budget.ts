/**
 * How the app's notification slots are divided up.
 *
 * iOS keeps at most **64 pending local notifications per app** and silently
 * drops the rest — not 64 per feature, 64 in total. Three features want slots
 * now (interval runs, a weekly schedule, one-off notes), so that ceiling has to
 * be shared deliberately, or whichever one schedules last quietly goes missing.
 *
 * The split: a weekly schedule may claim up to {@link REMINDER_BUDGET} and
 * one-offs up to {@link ONEOFF_BUDGET}, both of which are refused at the editor
 * rather than truncated. Interval runs take whatever is actually free at the
 * moment they are planned, and share it between themselves.
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

/**
 * Pending one-off notes allowed at once.
 *
 * Each one-off holds exactly one slot until it fires. Small on purpose: a note
 * is a single reminder, and someone with fifty pending notes wants a to-do app,
 * not this. Being small also means one-offs can never be the reason a run goes
 * quiet.
 */
export const ONEOFF_BUDGET = 8;

/** Cap on interval-run alerts when nothing else is pending — headroom under the ceiling. */
export const MAX_RUN_ALERTS = 60;

/**
 * Slots interval runs may use between them, given what the other two features
 * currently hold.
 *
 * This is the budget for *all* running timers together, not each — they are
 * planned as one set and share the allowance, because iOS counts them as one
 * set too. `planRunAlerts` is what divides it up.
 *
 * A long run refills its window on every re-plan, so taking fewer slots costs
 * reach into the future rather than correctness. That is precisely why runs get
 * the leftovers and the other two get fixed, guaranteed allowances: a weekly
 * schedule cannot refill, and a one-off gets exactly one chance.
 */
export function runAlertBudget(reminderSlots = 0, oneoffSlots = 0): number {
  const claimed = count(reminderSlots) + count(oneoffSlots);
  return Math.max(0, Math.min(MAX_RUN_ALERTS, NOTIFICATION_LIMIT - claimed));
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
