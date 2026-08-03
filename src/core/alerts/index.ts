/**
 * Public surface of the alerting primitives shared by both modes: how long the
 * phone buzzes, and how the 64-notification ceiling is divided up.
 */
export { MAX_RUN_ALERTS, NOTIFICATION_LIMIT, ONEOFF_BUDGET, REMINDER_BUDGET, runAlertBudget } from './budget';

export {
  ALERT_SOUNDS,
  canStepRing,
  canStepSound,
  DEFAULT_SOUND_ID,
  formatRingLabel,
  formatSoundLabel,
  hasRingLength,
  isSilentSound,
  normalizeRingMs,
  normalizeSoundId,
  RING_LIMITS,
  RING_OPTIONS,
  ringDurationMs,
  SILENT_SOUND_ID,
  soundFileFor,
  stepRingMs,
  stepSoundId,
} from './sound';
export type { AlertSound, SoundKind } from './sound';

export { alertDurationMs, restFloorMs } from './duration';
export type { AlertProfile } from './duration';

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
