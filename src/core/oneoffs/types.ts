import type { MinuteOfDay, Weekday } from '../clock';

/**
 * A single note, delivered once, on a day and at a time you pick.
 *
 * The third thing this app does, and the one that is neither a run nor a
 * standing arrangement. A timer is anchored to the instant you press start; a
 * schedule is anchored to nothing and repeats forever; a one-off is anchored to
 * the *next* Thursday at 15:00 and then ceases to exist.
 *
 * What is deliberately absent is a date. The note carries a weekday and a
 * minute of the day, and iOS resolves that to a real moment with a
 * non-repeating calendar trigger. That means the app never does date
 * arithmetic, never stores an instant that could be wrong by an hour after a
 * daylight-saving change, and never has to be open for the note to arrive.
 */
export interface OneOff {
  /** Stable identity. Namespaces the notification key, so cancelling one leaves the rest alone. */
  readonly id: string;
  /** What the notification says. The whole point of the feature. */
  readonly note: string;
  readonly weekday: Weekday;
  readonly minuteOfDay: MinuteOfDay;
  /** Which bundled voice it plays. See `src/core/alerts/sound.ts`. */
  readonly soundId: string;
  /**
   * How long the phone buzzes if it arrives while the app is open, in ms.
   * With the app closed, iOS gives its own single buzz and no setting changes
   * that — the same limit the other two modes live with.
   */
  readonly vibrationMs: number;
}

/** One note, resolved into the notification it becomes. */
export interface OneOffSlot {
  /** Stable identity, so re-arming replaces rather than duplicates. */
  readonly key: string;
  readonly oneOffId: string;
  readonly weekday: Weekday;
  readonly minuteOfDay: MinuteOfDay;
  /** 0..23, as iOS's calendar trigger wants it. */
  readonly hour: number;
  /** 0..59. */
  readonly minute: number;
  readonly title: string;
  readonly body: string;
  readonly soundId: string;
}
