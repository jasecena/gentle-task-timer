import {
  dayName,
  formatClock,
  formatLeadTime,
  minutesUntilNext,
  toClockParts,
  weekMinute,
  type MinuteOfDay,
  type Weekday,
} from '../clock';
import type { OneOff, OneOffSlot } from './types';

/**
 * Turning notes into the notifications they become, and working out how far off
 * they are.
 *
 * The scheduling itself needs no arithmetic at all: a slot carries a weekday
 * and an hour/minute, and iOS's non-repeating calendar trigger resolves that to
 * the next matching moment *in local time*. That is why this file has no
 * `Date`, no epoch milliseconds and no timezone handling — and why a note set
 * for Sunday 09:00 still arrives at 09:00 after the clocks change, which a
 * stored instant would not.
 *
 * The arithmetic that does exist is for display only: "in 3 days" on a list
 * row. Getting that wrong costs a wrong label, not a missed reminder.
 */

/**
 * Where the phone's clock currently is on the weekly grid.
 *
 * Supplied by the caller rather than read here: `src/core` reads no clock, so
 * "what does a note set for Sunday say at 23:59 on Saturday?" is a unit test
 * with two numbers in it.
 */
export interface ClockNow {
  readonly weekday: Weekday;
  readonly minuteOfDay: MinuteOfDay;
}

/** How many minutes until a note fires. Always at least 1 — see `minutesUntilNext`. */
export function minutesUntilOneOff(oneoff: OneOff, now: ClockNow): number {
  return minutesUntilNext(weekMinute(now.weekday, now.minuteOfDay), weekMinute(oneoff.weekday, oneoff.minuteOfDay));
}

/** `"Monday 09:00 · in 3 days"` — the summary on a list row. */
export function describeOneOff(oneoff: OneOff, now: ClockNow): string {
  return `${dayName(oneoff.weekday)} ${formatClock(oneoff.minuteOfDay)} · ${formatLeadTime(minutesUntilOneOff(oneoff, now))}`;
}

/** The notification identifier for a note. Namespaced by id so cancelling one leaves the rest pending. */
export function oneOffKey(id: string): string {
  return `oneoff-${id}`;
}

/**
 * A note as the notification iOS should hold.
 *
 * The note itself is the **title**, not the body. A banner shows the title
 * first and in bold, and the whole reason someone wrote "call the dentist" is
 * to read those three words without unlocking anything. The body carries the
 * day and time, which is the useful thing to still see when you find the
 * notification hours later in Notification Centre.
 */
export function planOneOff(oneoff: OneOff): OneOffSlot {
  return {
    key: oneOffKey(oneoff.id),
    oneOffId: oneoff.id,
    weekday: oneoff.weekday,
    minuteOfDay: oneoff.minuteOfDay,
    ...toClockParts(oneoff.minuteOfDay),
    title: oneoff.note,
    body: `${dayName(oneoff.weekday)} ${formatClock(oneoff.minuteOfDay)}`,
    soundId: oneoff.soundId,
    ringMs: oneoff.ringMs,
  };
}

/** Every note as a slot. Notes with no text plan nothing — there would be nothing to say. */
export function planOneOffs(oneoffs: readonly OneOff[]): OneOffSlot[] {
  return oneoffs.filter((oneoff) => oneoff.note.trim().length > 0).map(planOneOff);
}

/**
 * Drops the notes that have already fired.
 *
 * Worked out by asking iOS what it is still holding rather than by comparing
 * clocks, which is the only method that cannot be wrong. A non-repeating
 * notification disappears from the pending list the moment it is delivered, so
 * "not pending any more" means "it happened" — no date arithmetic, no daylight
 * saving, no grace period to tune.
 *
 * The one case this treats as fired but is not is a note iOS dropped on its own
 * (permission revoked, or the app reinstalled). Forgetting it is the right
 * answer there too: the note was never going to arrive, and leaving it on
 * screen would promise something the OS is not going to do.
 */
export function pruneFired(oneoffs: readonly OneOff[], pendingKeys: readonly string[]): OneOff[] {
  const pending = new Set(pendingKeys);
  return oneoffs.filter((oneoff) => pending.has(oneOffKey(oneoff.id)));
}
