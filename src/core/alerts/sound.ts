/**
 * Which sound an alert makes, and for how long.
 *
 * A notification's sound is chosen per-notification, not per-app: every request
 * carries a filename, and iOS plays that file from the app bundle. Getting the
 * files *into* the bundle is what the `expo-notifications` config plugin's
 * `sounds` array does — and the reason this app carries an `aps-environment`
 * entitlement and a Push Notifications capability on the App ID. See
 * docs/ARCHITECTURE.md; that was a deliberate trade, not an accident.
 *
 * The voices themselves are synthesised by `scripts/make-alert-sounds.py`, so
 * they have no licence and no provenance question at App Review.
 *
 * This module is pure: it maps an id and a length to a filename and a label,
 * and nothing here knows what a notification is. That keeps "does an unknown
 * stored id fall back safely?" a unit test rather than a device check.
 */

/**
 * What the phone should do when the alert arrives.
 *
 * `silent` is a first-class choice, not the absence of one. It is how you get
 * a buzz and no noise — though see the caveat on {@link isSilentSound}, because
 * the buzz half of that is not actually the app's to promise.
 */
export type SoundKind = 'system' | 'silent' | 'bundled';

export interface AlertSound {
  readonly id: string;
  /** Shown in the picker. */
  readonly label: string;
  readonly kind: SoundKind;
  /** Bundled filename for the short ring, or null for the system and silent entries. */
  readonly shortFile: string | null;
  /** Bundled filename for the long ring. Null wherever `shortFile` is. */
  readonly longFile: string | null;
}

/** The system sound. First in the list, and the fallback for anything unrecognised. */
export const DEFAULT_SOUND_ID = 'default';

/** No sound at all. */
export const SILENT_SOUND_ID = 'silent';

export const RING_LIMITS = {
  /** One motif. What every alert did before ring length existed. */
  SHORT_MS: 1_500,
  /**
   * Ten seconds of the motif recurring.
   *
   * The ceiling is iOS's, not ours: a custom notification sound may be up to 30
   * seconds, and iOS plays it to the end with no way for the app to stop it
   * early. Ten is long enough to catch you in another room and short enough
   * that being unable to cut it off is not a misfeature.
   */
  LONG_MS: 10_000,
} as const;

export const RING_OPTIONS: readonly number[] = [RING_LIMITS.SHORT_MS, RING_LIMITS.LONG_MS];

/**
 * The voices offered, in picker order.
 *
 * Deliberately short. Every entry is ~560KB in the bundle across its two
 * lengths and one more thing to step past, and the useful distinction is
 * between "a bell", "something dry", "the system one" and "nothing" — not
 * between twelve bells.
 */
export const ALERT_SOUNDS: readonly AlertSound[] = [
  { id: DEFAULT_SOUND_ID, label: 'Default', kind: 'system', shortFile: null, longFile: null },
  { id: SILENT_SOUND_ID, label: 'Silent', kind: 'silent', shortFile: null, longFile: null },
  { id: 'chime', label: 'Chime', kind: 'bundled', shortFile: 'chime.wav', longFile: 'chime-10s.wav' },
  { id: 'bell', label: 'Bell', kind: 'bundled', shortFile: 'bell.wav', longFile: 'bell-10s.wav' },
  { id: 'marimba', label: 'Marimba', kind: 'bundled', shortFile: 'marimba.wav', longFile: 'marimba-10s.wav' },
  { id: 'pulse', label: 'Pulse', kind: 'bundled', shortFile: 'pulse.wav', longFile: 'pulse-10s.wav' },
];

function find(id: string): AlertSound | undefined {
  return ALERT_SOUNDS.find((sound) => sound.id === id);
}

/**
 * Coerces anything into a usable sound id.
 *
 * An id from a future build — or from a voice that was removed — degrades to
 * the system sound rather than to silence. A notification with a filename iOS
 * cannot resolve is delivered *silently*, which would read as a broken alert,
 * so the fallback has to be something that definitely makes a noise.
 */
export function normalizeSoundId(id: unknown): string {
  return typeof id === 'string' && find(id) !== undefined ? id : DEFAULT_SOUND_ID;
}

/** Clamps any input to an offered ring length. Anything unrecognised reads as short. */
export function normalizeRingMs(ringMs: unknown): number {
  if (typeof ringMs !== 'number' || !Number.isFinite(ringMs)) return RING_LIMITS.SHORT_MS;
  // Nearest offered length, so a value from another build degrades sensibly
  // rather than resetting.
  return RING_OPTIONS.reduce((best, option) => (Math.abs(option - ringMs) < Math.abs(best - ringMs) ? option : best));
}

/**
 * True when this alert should make no noise.
 *
 * Worth being precise about what this does and does not buy, because it is
 * asked for as "vibrate but do not ring" and only half delivers that:
 *
 * - **With the app open** it is exact. The app skips the sound and runs its own
 *   vibration train.
 * - **With the app closed** the notification is delivered without a sound, but
 *   whether the phone *buzzes* is the user's Ring/Silent switch and their
 *   Haptics settings. iOS gives an app no way to request a vibration without a
 *   sound, so that half is not ours to promise.
 */
export function isSilentSound(id: string): boolean {
  return find(normalizeSoundId(id))?.kind === 'silent';
}

/**
 * The bundled filename for an id at a given ring length, or null to let iOS use
 * its own sound (or none, for the silent entry — callers distinguish the two
 * with {@link isSilentSound}).
 */
export function soundFileFor(id: string, ringMs: number = RING_LIMITS.SHORT_MS): string | null {
  const sound = find(normalizeSoundId(id));
  if (sound === undefined || sound.kind !== 'bundled') return null;
  return normalizeRingMs(ringMs) === RING_LIMITS.LONG_MS ? sound.longFile : sound.shortFile;
}

/**
 * How long this alert actually makes noise for.
 *
 * Zero for the silent entry, and zero for the system sound too — iOS's own
 * notification sound is a fraction of a second and nothing the app schedules
 * around. Used to work out how much rest a run needs so an alert cannot eat it
 * (see `normalizeConfig`).
 */
export function ringDurationMs(id: string, ringMs: number): number {
  return soundFileFor(id, ringMs) === null ? 0 : normalizeRingMs(ringMs);
}

/** Human label for a sound id, for the picker and for summaries. */
export function formatSoundLabel(id: string): string {
  return find(normalizeSoundId(id))?.label ?? 'Default';
}

/** `"Short"` or `"10s"`. */
export function formatRingLabel(ringMs: number): string {
  return normalizeRingMs(ringMs) === RING_LIMITS.LONG_MS ? '10s' : 'Short';
}

/** Moves one step along {@link ALERT_SOUNDS}, stopping at either end. */
export function stepSoundId(current: string, direction: 1 | -1): string {
  const index = ALERT_SOUNDS.findIndex((sound) => sound.id === normalizeSoundId(current));
  const next = Math.min(ALERT_SOUNDS.length - 1, Math.max(0, index + direction));
  return ALERT_SOUNDS[next]!.id;
}

/** Moves one step along {@link RING_OPTIONS}, stopping at either end. */
export function stepRingMs(current: number, direction: 1 | -1): number {
  const index = RING_OPTIONS.indexOf(normalizeRingMs(current));
  const next = Math.min(RING_OPTIONS.length - 1, Math.max(0, index + direction));
  return RING_OPTIONS[next]!;
}

/** True when this id is not the first/last entry — drives the picker's dead buttons. */
export function canStepSound(current: string, direction: 1 | -1): boolean {
  return stepSoundId(current, direction) !== normalizeSoundId(current);
}

/** True when a ring-length step would change anything. */
export function canStepRing(current: number, direction: 1 | -1): boolean {
  return stepRingMs(current, direction) !== normalizeRingMs(current);
}

/**
 * Whether a ring length is worth offering for this voice at all.
 *
 * The system sound and the silent entry have exactly one length, so the control
 * is disabled rather than hidden — a row that appears and disappears as you
 * step through voices is worse than one that greys out.
 */
export function hasRingLength(id: string): boolean {
  return find(normalizeSoundId(id))?.kind === 'bundled';
}
