import { normalizeVibrationMs, VIBRATION_LIMITS } from '../alerts/vibration';
import type { TimerConfig } from './types';

/** Hard bounds. These exist to keep a fat-fingered input from producing a schedule with millions of phases. */
export const LIMITS = {
  /** One second. Anything shorter is not usefully perceivable as a phase. */
  MIN_WORK_MS: 1_000,
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
  restDurationMs: 0,
  repeats: 1,
  vibrationMs: 3_000,
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
    issues.push({ field: 'workDurationMs', message: 'Work duration must be at least 1 second.' });
  } else if (config.workDurationMs > LIMITS.MAX_WORK_MS) {
    issues.push({ field: 'workDurationMs', message: 'Work duration cannot exceed 24 hours.' });
  }

  if (!isFiniteInteger(config.restDurationMs)) {
    issues.push({ field: 'restDurationMs', message: 'Rest duration must be a whole number of milliseconds.' });
  } else if (config.restDurationMs < LIMITS.MIN_REST_MS) {
    issues.push({ field: 'restDurationMs', message: 'Rest duration cannot be negative.' });
  } else if (config.restDurationMs > LIMITS.MAX_REST_MS) {
    issues.push({ field: 'restDurationMs', message: 'Rest duration cannot exceed 24 hours.' });
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

  return {
    name,
    workDurationMs: clamp(
      source.workDurationMs ?? DEFAULT_CONFIG.workDurationMs,
      LIMITS.MIN_WORK_MS,
      LIMITS.MAX_WORK_MS,
    ),
    restDurationMs: clamp(
      source.restDurationMs ?? DEFAULT_CONFIG.restDurationMs,
      LIMITS.MIN_REST_MS,
      LIMITS.MAX_REST_MS,
    ),
    repeats: clamp(source.repeats ?? DEFAULT_CONFIG.repeats, LIMITS.MIN_REPEATS, LIMITS.MAX_REPEATS),
    vibrationMs: normalizeVibrationMs(source.vibrationMs ?? DEFAULT_CONFIG.vibrationMs),
  };
}
