import { restFloorMs } from '../alerts/duration';
import { DEFAULT_SOUND_ID, normalizeRingMs, normalizeSoundId, RING_LIMITS } from '../alerts/sound';
import { normalizeVibrationMs, VIBRATION_LIMITS } from '../alerts/vibration';
import type { TimerConfig } from './types';

/** Hard bounds. These exist to keep a fat-fingered input from producing a schedule with millions of phases. */
export const LIMITS = {
  /**
   * Thirty seconds, which is also the step size.
   *
   * Shorter phases are not a useful chunk of work — they are a metronome, and
   * one that spends the notification budget at a phase a second. The floor
   * matching the step means the minimum is always reachable by pressing −.
   */
  MIN_WORK_MS: 30_000,
  /** 24 hours. */
  MAX_WORK_MS: 24 * 60 * 60 * 1_000,
  MIN_REST_MS: 0,
  MAX_REST_MS: 24 * 60 * 60 * 1_000,
  MIN_REPEATS: 1,
  /**
   * Caps the phase list at 999 work + 998 rest phases. Also keeps us well clear
   * of iOS's 64-pending-local-notification ceiling being a surprise later.
   */
  MAX_REPEATS: 999,
  MAX_NAME_LENGTH: 60,
} as const;

export const DEFAULT_CONFIG: TimerConfig = {
  name: 'Timer',
  workDurationMs: 60_000,
  // Exactly the default vibration length, and not a coincidence: a rest shorter
  // than the alert announcing it would fail `validateConfig`, and a default
  // that cannot pass its own validator is a trap for every caller that starts
  // from it.
  restDurationMs: 3_000,
  repeats: 1,
  vibrationMs: 3_000,
  soundId: DEFAULT_SOUND_ID,
  ringMs: RING_LIMITS.SHORT_MS,
};

export interface ValidationIssue {
  readonly field: keyof TimerConfig;
  readonly message: string;
}

function isFiniteInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Validates a candidate config, returning every problem found rather than
 * throwing on the first. Callers that want a guaranteed-good config should use
 * {@link normalizeConfig}.
 */
export function validateConfig(config: TimerConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const name = config.name.trim();
  if (name.length === 0) {
    issues.push({ field: 'name', message: 'Name cannot be empty.' });
  } else if (name.length > LIMITS.MAX_NAME_LENGTH) {
    issues.push({
      field: 'name',
      message: `Name cannot exceed ${LIMITS.MAX_NAME_LENGTH} characters.`,
    });
  }

  if (!isFiniteInteger(config.workDurationMs)) {
    issues.push({ field: 'workDurationMs', message: 'Work duration must be a whole number of milliseconds.' });
  } else if (config.workDurationMs < LIMITS.MIN_WORK_MS) {
    issues.push({ field: 'workDurationMs', message: 'Work duration must be at least 30 seconds.' });
  } else if (config.workDurationMs > LIMITS.MAX_WORK_MS) {
    issues.push({ field: 'workDurationMs', message: 'Work duration cannot exceed 24 hours.' });
  }

  // One rest message, not several: a negative rest is also below the alert
  // floor, and reporting both would show the same field twice with two
  // different fixes.
  if (!isFiniteInteger(config.restDurationMs)) {
    issues.push({ field: 'restDurationMs', message: 'Rest duration must be a whole number of milliseconds.' });
  } else if (config.restDurationMs < LIMITS.MIN_REST_MS) {
    issues.push({ field: 'restDurationMs', message: 'Rest duration cannot be negative.' });
  } else if (config.restDurationMs > LIMITS.MAX_REST_MS) {
    issues.push({ field: 'restDurationMs', message: 'Rest duration cannot exceed 24 hours.' });
  } else {
    // A rest shorter than the alert announcing it is not a rest — the noise is
    // still going when the next work phase starts. Zero counts: it is the
    // shortest rest of all. normalizeConfig lifts it, so this only fires for a
    // config that never went through there.
    const floor = restFloorMs(config.restDurationMs, config);
    if (config.restDurationMs < floor) {
      issues.push({
        field: 'restDurationMs',
        message: `Rest must be at least as long as the alert (${Math.round(floor / 1_000)}s).`,
      });
    }
  }

  if (!isFiniteInteger(config.repeats)) {
    issues.push({ field: 'repeats', message: 'Repeats must be a whole number.' });
  } else if (config.repeats < LIMITS.MIN_REPEATS) {
    issues.push({ field: 'repeats', message: 'There must be at least 1 repeat.' });
  } else if (config.repeats > LIMITS.MAX_REPEATS) {
    issues.push({ field: 'repeats', message: `Repeats cannot exceed ${LIMITS.MAX_REPEATS}.` });
  }

  // Zero is valid: it means vibration is off. Anything between zero and the
  // minimum is not, because a buzz shorter than a single system pulse is a
  // setting the phone cannot honour.
  if (!isFiniteInteger(config.vibrationMs)) {
    issues.push({ field: 'vibrationMs', message: 'Vibration length must be a whole number of milliseconds.' });
  } else if (config.vibrationMs !== VIBRATION_LIMITS.OFF_MS && config.vibrationMs < VIBRATION_LIMITS.MIN_ON_MS) {
    issues.push({ field: 'vibrationMs', message: 'Vibration must be off, or at least 1 second.' });
  } else if (config.vibrationMs > VIBRATION_LIMITS.MAX_MS) {
    issues.push({ field: 'vibrationMs', message: 'Vibration cannot exceed 10 seconds.' });
  }

  // An id no longer in the list would be handed to iOS as a filename it cannot
  // resolve, and a notification with an unresolvable sound is delivered in
  // silence — which reads as a broken alert rather than a missing voice.
  if (normalizeSoundId(config.soundId) !== config.soundId) {
    issues.push({ field: 'soundId', message: 'Unknown alert sound.' });
  }

  if (normalizeRingMs(config.ringMs) !== config.ringMs) {
    issues.push({ field: 'ringMs', message: 'Ring length must be one of the offered options.' });
  }

  return issues;
}

export function isValidConfig(config: TimerConfig): boolean {
  return validateConfig(config).length === 0;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Coerces arbitrary input into a config that always satisfies
 * {@link validateConfig}. Used at trust boundaries — restoring persisted state,
 * or accepting values straight from a text input — so that no downstream code
 * has to defend against a NaN duration.
 */
export function normalizeConfig(config: Partial<TimerConfig> | null | undefined): TimerConfig {
  const source = config ?? {};
  const rawName = typeof source.name === 'string' ? source.name.trim() : '';
  const name = rawName.length === 0 ? DEFAULT_CONFIG.name : rawName.slice(0, LIMITS.MAX_NAME_LENGTH);

  const soundId = normalizeSoundId(source.soundId);
  const ringMs = normalizeRingMs(source.ringMs ?? DEFAULT_CONFIG.ringMs);
  const vibrationMs = normalizeVibrationMs(source.vibrationMs ?? DEFAULT_CONFIG.vibrationMs);

  return {
    name,
    workDurationMs: clamp(
      source.workDurationMs ?? DEFAULT_CONFIG.workDurationMs,
      LIMITS.MIN_WORK_MS,
      LIMITS.MAX_WORK_MS,
    ),
    // Lifted to the alert's length, so an alert can never run into the work
    // phase that follows it. Zero is lifted too: "no rest, but a ten-second
    // buzz at every boundary" is the problem, not an exception to it.
    restDurationMs: restFloorMs(
      clamp(source.restDurationMs ?? DEFAULT_CONFIG.restDurationMs, LIMITS.MIN_REST_MS, LIMITS.MAX_REST_MS),
      { vibrationMs, soundId, ringMs },
    ),
    repeats: clamp(source.repeats ?? DEFAULT_CONFIG.repeats, LIMITS.MIN_REPEATS, LIMITS.MAX_REPEATS),
    vibrationMs,
    soundId,
    ringMs,
  };
}
