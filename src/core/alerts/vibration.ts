/**
 * Building vibration patterns of a chosen length.
 *
 * iOS gives no "vibrate for N seconds" API. The only thing available is a fixed
 * ~400ms system buzz, fired one at a time — React Native's `Vibration.vibrate`
 * ignores the durations in a pattern on iOS and honours only the *gaps* between
 * them. A three-second vibration is therefore a train of buzzes spaced to fill
 * three seconds, which is what this module builds.
 *
 * Two consequences worth knowing:
 *
 * - Driving a train needs JavaScript running, so a long vibration only happens
 *   with the app in the foreground. With the app closed, a notification gets
 *   the single system buzz iOS gives it and nothing here applies.
 * - The train can be stopped part-way (`Vibration.cancel()`), which is what the
 *   in-app stop control does.
 */

/** Length of one system buzz. Not configurable on iOS — this is what the OS gives. */
export const PULSE_MS = 400;

export const VIBRATION_LIMITS = {
  /** Zero means off, and is a first-class setting rather than an edge case. */
  OFF_MS: 0,
  MIN_ON_MS: 1_000,
  MAX_MS: 10_000,
} as const;

/**
 * The gap rhythm between buzzes, cycled until the duration is used up.
 *
 * Distinct rhythms are what make two alerts tellable apart in a pocket, without
 * looking at the screen — a single long buzz and a stutter read differently
 * even when they last the same time.
 */
export type VibrationRhythm = 'single' | 'double' | 'triple';

const RHYTHM_GAPS: Record<VibrationRhythm, readonly number[]> = {
  /** Evenly spaced. Reads as one continuous buzz. */
  single: [400],
  /** Buzz-buzz … pause. */
  double: [150, 550],
  /** Buzz-buzz-buzz … pause. */
  triple: [150, 150, 650],
};

/** Clamps any input to a usable vibration length: off, or 1s to 10s. */
export function normalizeVibrationMs(durationMs: number | null | undefined): number {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return VIBRATION_LIMITS.OFF_MS;
  }
  const rounded = Math.round(durationMs);
  if (rounded < VIBRATION_LIMITS.MIN_ON_MS) return VIBRATION_LIMITS.MIN_ON_MS;
  return Math.min(rounded, VIBRATION_LIMITS.MAX_MS);
}

/**
 * A React Native vibration pattern lasting about `durationMs`.
 *
 * The returned array is `[0, gap, gap, …]`: a leading zero buzzes immediately,
 * and every later entry is the pause before the next buzz. An empty array means
 * "do not vibrate" — callers should skip the call entirely rather than pass it
 * on, since an empty pattern is not something the platform accepts.
 *
 * The train never overruns its budget: a buzz is only added if it and its gap
 * fit inside `durationMs`, so a 3s setting vibrates for at most 3s.
 */
export function buildVibrationPattern(durationMs: number, rhythm: VibrationRhythm = 'single'): number[] {
  const budget = normalizeVibrationMs(durationMs);
  if (budget === VIBRATION_LIMITS.OFF_MS) return [];

  const gaps = RHYTHM_GAPS[rhythm];
  const pattern = [0];
  let elapsed = PULSE_MS;

  for (let index = 0; ; index += 1) {
    const gap = gaps[index % gaps.length]!;
    if (elapsed + gap + PULSE_MS > budget) break;
    pattern.push(gap);
    elapsed += gap + PULSE_MS;
  }

  return pattern;
}

/** How long a pattern from {@link buildVibrationPattern} actually runs. */
export function vibrationPatternDurationMs(pattern: readonly number[]): number {
  if (pattern.length === 0) return 0;
  const gaps = pattern.slice(1).reduce((total, gap) => total + gap, 0);
  return gaps + pattern.length * PULSE_MS;
}

/**
 * The settings offered in the UI.
 *
 * A short list of round numbers rather than a free slider: the difference
 * between a 3s and a 3.4s buzz is not something anyone can feel, and every
 * extra option is one more thing to scroll past.
 */
export const VIBRATION_OPTIONS: readonly number[] = [
  VIBRATION_LIMITS.OFF_MS,
  1_000,
  3_000,
  5_000,
  VIBRATION_LIMITS.MAX_MS,
];

/** Moves one step along {@link VIBRATION_OPTIONS}, stopping at either end. */
export function stepVibrationMs(current: number, direction: 1 | -1): number {
  const normalized = normalizeVibrationMs(current);
  // An unrecognised stored value lands on the nearest option rather than
  // resetting the setting, so a config from a future build degrades gracefully.
  const index = VIBRATION_OPTIONS.reduce(
    (best, option, candidate) =>
      Math.abs(option - normalized) < Math.abs(VIBRATION_OPTIONS[best]! - normalized) ? candidate : best,
    0,
  );
  const next = Math.min(VIBRATION_OPTIONS.length - 1, Math.max(0, index + direction));
  return VIBRATION_OPTIONS[next]!;
}

/** Human label for a vibration setting, for the picker and for summaries. */
export function formatVibrationLabel(durationMs: number): string {
  const normalized = normalizeVibrationMs(durationMs);
  return normalized === VIBRATION_LIMITS.OFF_MS ? 'Off' : `${Math.round(normalized / 1_000)}s`;
}
