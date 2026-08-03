/**
 * Core timer domain types.
 *
 * This module — and everything else under `src/core` — is pure TypeScript with
 * zero React, React Native or Expo imports. That is deliberate: it lets the
 * entire timing model be unit-tested on a Linux box with no simulator, and it
 * keeps the part of the app that must be *correct* separate from the part that
 * must merely look right.
 */

/** What the user is doing during a given stretch of time. */
export type PhaseKind = 'work' | 'rest';

/** Lifecycle of a timer run. */
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

/**
 * A user-authored timer definition.
 *
 * A run is `repeats` work phases, separated by rest phases when
 * `restDurationMs > 0`. There is never a trailing rest phase — the run ends the
 * moment the last work phase ends.
 *
 * Example: work=120_000, rest=30_000, repeats=3 produces
 * work(2m) rest(30s) work(2m) rest(30s) work(2m) = 6m30s total.
 */
export interface TimerConfig {
  /**
   * Display name, shown on screen and used as the *title* of every alert this
   * run posts. With several timers running at once that title is the only thing
   * telling you which one just finished, so it earns its place on the banner.
   */
  readonly name: string;
  /** Duration of each main/work phase, in milliseconds. */
  readonly workDurationMs: number;
  /** Duration of the gap between work phases, in ms. Zero disables rest phases. */
  readonly restDurationMs: number;
  /** How many work phases to run. Always >= 1. */
  readonly repeats: number;
  /**
   * How long the phone buzzes at a boundary, in ms. Zero turns vibration off.
   *
   * Only applies with the app in the foreground — a long buzz is a train of
   * pulses driven from JavaScript, and iOS does not run JavaScript for a
   * backgrounded app. See `src/core/alerts/vibration.ts`.
   */
  readonly vibrationMs: number;
  /**
   * Which bundled voice this run's alerts play. See `src/core/alerts/sound.ts`.
   *
   * Unlike vibration, this one *does* reach you with the app closed: the sound
   * is a property of the notification, so iOS plays it whether or not any
   * JavaScript is running.
   */
  readonly soundId: string;
  /**
   * How long the chosen voice rings for, in ms. Only meaningful for a bundled
   * voice — the system sound has one length and the silent entry has none.
   */
  readonly ringMs: number;
  /**
   * Whether the end of a *rest* phase alerts.
   *
   * Off by default, which is the surprising-sounding half of this setting and the right one.
   * The alert that matters is the one telling you to stop working; being told a rest is over
   * is only useful if you were going to act on it immediately, which is a training pattern
   * rather than the general case. Left on, it means a buzz every time you settle.
   *
   * Turn it on for sets and reps, where "rest is over, go again" is the whole point.
   *
   * Note this governs the *rest-end* boundary only. Work-end and run-end always alert — a
   * timer that can be configured to never tell you anything is not a timer.
   */
  readonly restEndAlert: boolean;
}

/**
 * One resolved stretch of a run, positioned on the run's timeline.
 *
 * Offsets are measured from the start of the run, so a phase is fully described
 * without reference to wall-clock time. This is what makes the schedule a pure
 * function of the config.
 */
export interface Phase {
  readonly kind: PhaseKind;
  /** Position in the phase list, 0-based. */
  readonly index: number;
  /** Which work cycle this belongs to, 1-based. A rest phase belongs to the cycle it follows. */
  readonly cycle: number;
  /** Milliseconds from run start to the beginning of this phase. */
  readonly startOffsetMs: number;
  readonly durationMs: number;
  /** Milliseconds from run start to the end of this phase. */
  readonly endOffsetMs: number;
}

/** The full timeline of a run, derived from a {@link TimerConfig}. */
export interface Schedule {
  readonly phases: readonly Phase[];
  readonly totalDurationMs: number;
  /** Number of work phases, i.e. `config.repeats`. */
  readonly totalCycles: number;
}

/**
 * The persistent state of a timer run.
 *
 * Note what is *not* here: any notion of "ticks remaining". Elapsed time is
 * reconstructed from wall-clock timestamps on demand (see `elapsedMsAt`), so a
 * run stays accurate across backgrounding, JS thread stalls, dropped frames and
 * app restarts. A counter that decrements on an interval would drift on all
 * four.
 */
export interface TimerState {
  readonly config: TimerConfig;
  readonly status: TimerStatus;
  /** Milliseconds already elapsed in previous run segments (before the current resume). */
  readonly accumulatedMs: number;
  /** Epoch ms at which the current running segment began; null unless status is 'running'. */
  readonly lastResumedAt: number | null;
}

/**
 * A read-only view of a run at a specific instant, derived from
 * {@link TimerState} + `now`. Everything the UI renders comes from here.
 */
export interface TimerProjection {
  readonly status: TimerStatus;
  /** Total elapsed run time in ms, clamped to the run duration. */
  readonly elapsedMs: number;
  readonly totalDurationMs: number;
  /** Time left in the whole run, in ms. */
  readonly totalRemainingMs: number;
  /** The phase currently in progress, or null when idle/completed. */
  readonly phase: Phase | null;
  /** Time left in the current phase, in ms. Zero when there is no current phase. */
  readonly phaseRemainingMs: number;
  readonly phaseElapsedMs: number;
  /** 1-based index of the work cycle in progress, or the last one when completed. */
  readonly currentCycle: number;
  readonly totalCycles: number;
  /** Number of work phases fully finished. */
  readonly completedCycles: number;
  /** Fraction of the whole run completed, 0..1. */
  readonly progress: number;
}
