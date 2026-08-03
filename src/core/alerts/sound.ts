/**
 * Which sound an alert makes.
 *
 * A notification's sound is chosen per-notification, not per-app: every request
 * carries a filename, and iOS plays that file from the app bundle. Getting the
 * files *into* the bundle is what the `expo-notifications` config plugin's
 * `sounds` array does — and the reason this app now carries an `aps-environment`
 * entitlement and a Push Notifications capability on the App ID. See
 * docs/ARCHITECTURE.md; that was a deliberate trade, not an accident.
 *
 * The voices themselves are synthesised by `scripts/make-alert-sounds.py`, so
 * they have no licence and no provenance question at App Review.
 *
 * This module is pure: it maps an id to a filename and a label, and nothing
 * here knows what a notification is. That keeps "does an unknown stored id fall
 * back safely?" a unit test rather than a device check.
 */

export interface AlertSound {
  readonly id: string;
  /** Shown in the picker. */
  readonly label: string;
  /**
   * Filename inside the bundle, or null for iOS's own notification sound.
   *
   * Null is not the absence of a choice — it is the choice to use the system
   * sound, which is the only one that still works if the bundled files ever
   * fail to copy.
   */
  readonly file: string | null;
}

/** The system sound. First in the list, and the fallback for anything unrecognised. */
export const DEFAULT_SOUND_ID = 'default';

/**
 * The voices offered, in picker order.
 *
 * Deliberately short. Every entry is ~130KB in the bundle and one more thing to
 * step past, and the useful distinction is between "a bell", "something dry"
 * and "the system one" — not between twelve bells.
 */
export const ALERT_SOUNDS: readonly AlertSound[] = [
  { id: DEFAULT_SOUND_ID, label: 'Default', file: null },
  { id: 'chime', label: 'Chime', file: 'chime.wav' },
  { id: 'bell', label: 'Bell', file: 'bell.wav' },
  { id: 'marimba', label: 'Marimba', file: 'marimba.wav' },
  { id: 'pulse', label: 'Pulse', file: 'pulse.wav' },
];

function find(id: string): AlertSound | undefined {
  return ALERT_SOUNDS.find((sound) => sound.id === id);
}

/**
 * Coerces anything into a usable sound id.
 *
 * An id from a future build — or from a voice that was removed — degrades to
 * the system sound rather than to silence. A notification with a filename iOS
 * cannot resolve is delivered *silently*, which would read as a broken alert.
 */
export function normalizeSoundId(id: unknown): string {
  return typeof id === 'string' && find(id) !== undefined ? id : DEFAULT_SOUND_ID;
}

/** The bundled filename for an id, or null to let iOS use its own sound. */
export function soundFileFor(id: string): string | null {
  return find(normalizeSoundId(id))?.file ?? null;
}

/** Human label for a sound id, for the picker and for summaries. */
export function formatSoundLabel(id: string): string {
  return find(normalizeSoundId(id))?.label ?? 'Default';
}

/** Moves one step along {@link ALERT_SOUNDS}, stopping at either end. */
export function stepSoundId(current: string, direction: 1 | -1): string {
  const index = ALERT_SOUNDS.findIndex((sound) => sound.id === normalizeSoundId(current));
  const next = Math.min(ALERT_SOUNDS.length - 1, Math.max(0, index + direction));
  return ALERT_SOUNDS[next]!.id;
}

/** True when this id is not the first/last entry — drives the picker's dead buttons. */
export function canStepSound(current: string, direction: 1 | -1): boolean {
  return stepSoundId(current, direction) !== normalizeSoundId(current);
}
