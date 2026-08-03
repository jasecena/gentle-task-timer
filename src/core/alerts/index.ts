/**
 * Public surface of the alerting primitives shared by both modes: how long the
 * phone buzzes, and how the 64-notification ceiling is divided up.
 */
export { MAX_RUN_ALERTS, NOTIFICATION_LIMIT, ONEOFF_BUDGET, REMINDER_BUDGET, runAlertBudget } from './budget';

export {
  ALERT_SOUNDS,
  canStepSound,
  DEFAULT_SOUND_ID,
  formatSoundLabel,
  normalizeSoundId,
  soundFileFor,
  stepSoundId,
} from './sound';
export type { AlertSound } from './sound';

export {
  buildVibrationPattern,
  formatVibrationLabel,
  normalizeVibrationMs,
  PULSE_MS,
  stepVibrationMs,
  VIBRATION_LIMITS,
  VIBRATION_OPTIONS,
  vibrationPatternDurationMs,
} from './vibration';
export type { VibrationRhythm } from './vibration';
