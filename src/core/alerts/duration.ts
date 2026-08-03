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
 * The shortest rest that still leaves the work phases whole.
 *
 * A ten-second alert across a five-second rest means the noise announcing the
 * rest is still going when the next work phase starts — so the rest was never
 * a rest, and the work began in the middle of a buzz.
 *
 * **Zero is not exempt**, and this is the correction v0.4.1 makes. "No rest"
 * with a ten-second buzz is the worst case of the problem rather than an
 * exception to it: the alert lands squarely inside the following work phase
 * with nothing to absorb it. Zero is a rest shorter than the alert, and it is
 * lifted like any other.
 *
 * The only way back to no rest at all is to have no alert at all — vibration
 * off and the voice set to Silent — at which point the floor is zero and the
 * run goes work-to-work with nothing to interrupt it. That is a coherent
 * arrangement; "no gap, but a ten-second noise at every boundary" is not.
 */
export function restFloorMs(restDurationMs: number, profile: AlertProfile): number {
  const rest = Number.isFinite(restDurationMs) ? Math.max(0, restDurationMs) : 0;
  return Math.max(rest, alertDurationMs(profile));
}
