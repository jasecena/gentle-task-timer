import { ringDurationMs } from './sound';
import { normalizeVibrationMs } from './vibration';

/**
 * How long an alert occupies, whatever it is made of.
 *
 * The buzz and the ring run at the same time rather than one after the other,
 * so an alert lasts as long as its longer half. Both are clamped on the way in,
 * because this is used to decide how much rest a run needs and a NaN here would
 * become a NaN phase.
 */
export interface AlertProfile {
  readonly vibrationMs: number;
  readonly soundId: string;
  readonly ringMs: number;
}

export function alertDurationMs(profile: AlertProfile): number {
  return Math.max(normalizeVibrationMs(profile.vibrationMs), ringDurationMs(profile.soundId, profile.ringMs));
}

/**
 * The shortest rest that still leaves a rest.
 *
 * A ten-second ring across a five-second rest means the alert announcing the
 * rest is still going when the next work phase starts — so the rest was never
 * a rest, and the work phase begins in the middle of a noise. Making the rest
 * at least as long as the alert is what keeps every phase boundary a real
 * boundary.
 *
 * Zero is left alone: it means "no rest phase at all", which is a different
 * arrangement rather than a very short rest, and lengthening it would invent a
 * phase the user did not ask for.
 */
export function restFloorMs(restDurationMs: number, profile: AlertProfile): number {
  if (!Number.isFinite(restDurationMs) || restDurationMs <= 0) return 0;
  return Math.max(restDurationMs, alertDurationMs(profile));
}
