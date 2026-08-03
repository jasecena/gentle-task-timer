import { ONEOFF_BUDGET } from '../alerts/budget';
import { DEFAULT_SOUND_ID, normalizeSoundId } from '../alerts/sound';
import { normalizeVibrationMs, VIBRATION_LIMITS } from '../alerts/vibration';
import { clampMinute, normalizeWeekday } from '../clock';
import type { OneOff } from './types';

export const ONEOFF_LIMITS = {
  /**
   * Long enough for a real sentence, short enough to read on a lock screen.
   * The note is the notification's *title*, and iOS wraps a title over a couple
   * of lines before it gives up — past this length nobody sees the end of it
   * without opening the app, which defeats the point of a reminder.
   */
  MAX_NOTE_LENGTH: 100,
  /** Pending notes at once, one notification slot each. See `src/core/alerts/budget.ts`. */
  MAX_ONEOFFS: ONEOFF_BUDGET,
} as const;

export const DEFAULT_ONEOFF: OneOff = {
  id: 'o1',
  note: '',
  weekday: 1,
  minuteOfDay: 9 * 60,
  soundId: DEFAULT_SOUND_ID,
  vibrationMs: 3_000,
};

export interface OneOffIssue {
  readonly field: keyof OneOff | 'count';
  readonly message: string;
}

/**
 * Every problem with a candidate note.
 *
 * Only two things can actually be wrong, because everything else is a stepper
 * over a bounded ladder. An empty note is the one that matters: a notification
 * with no text is a buzz you cannot interpret, which is worse than no
 * notification at all.
 */
export function validateOneOff(oneoff: OneOff, existingCount = 0): OneOffIssue[] {
  const issues: OneOffIssue[] = [];

  const note = oneoff.note.trim();
  if (note.length === 0) {
    issues.push({ field: 'note', message: 'Write a note — it is what the notification says.' });
  } else if (note.length > ONEOFF_LIMITS.MAX_NOTE_LENGTH) {
    issues.push({
      field: 'note',
      message: `Notes cannot exceed ${ONEOFF_LIMITS.MAX_NOTE_LENGTH} characters.`,
    });
  }

  if (existingCount >= ONEOFF_LIMITS.MAX_ONEOFFS) {
    issues.push({
      field: 'count',
      message: `${ONEOFF_LIMITS.MAX_ONEOFFS} notes is the limit. Delete one first.`,
    });
  }

  if (oneoff.vibrationMs !== VIBRATION_LIMITS.OFF_MS && oneoff.vibrationMs < VIBRATION_LIMITS.MIN_ON_MS) {
    issues.push({ field: 'vibrationMs', message: 'Vibration must be off, or at least 1 second.' });
  }

  if (normalizeSoundId(oneoff.soundId) !== oneoff.soundId) {
    issues.push({ field: 'soundId', message: 'Unknown alert sound.' });
  }

  return issues;
}

export function isValidOneOff(oneoff: OneOff, existingCount = 0): boolean {
  return validateOneOff(oneoff, existingCount).length === 0;
}

/**
 * Coerces arbitrary input into a structurally sound note.
 *
 * Note this fixes *shape*, not *policy*: the note may still come back empty,
 * because an empty note is something to show the user rather than something to
 * invent text for.
 */
export function normalizeOneOff(oneoff: Partial<OneOff> | null | undefined, fallbackId: string): OneOff {
  const source = oneoff ?? {};
  const rawNote = typeof source.note === 'string' ? source.note.trim() : '';

  return {
    id: typeof source.id === 'string' && source.id.length > 0 ? source.id : fallbackId,
    note: rawNote.slice(0, ONEOFF_LIMITS.MAX_NOTE_LENGTH),
    weekday: normalizeWeekday(source.weekday, DEFAULT_ONEOFF.weekday),
    minuteOfDay: clampMinute(source.minuteOfDay ?? DEFAULT_ONEOFF.minuteOfDay),
    soundId: normalizeSoundId(source.soundId),
    vibrationMs: normalizeVibrationMs(source.vibrationMs ?? DEFAULT_ONEOFF.vibrationMs),
  };
}

/**
 * Coerces a stored list.
 *
 * Notes with no text are dropped rather than repaired — one can only have come
 * from a store written by hand or by a broken build, and an untitled buzz is
 * not worth keeping. Duplicate ids are reassigned for the same reason runs
 * reassign theirs: two notes sharing an id share a notification key, and one
 * would silently cancel the other.
 */
export function normalizeOneOffs(input: readonly Partial<OneOff>[] | null | undefined): OneOff[] {
  if (!Array.isArray(input)) return [];

  const result: OneOff[] = [];
  const seen = new Set<string>();

  for (const entry of input.slice(0, ONEOFF_LIMITS.MAX_ONEOFFS)) {
    if (entry === null || typeof entry !== 'object') continue;

    const candidate = normalizeOneOff(entry, nextOneOffId(result));
    if (candidate.note.length === 0) continue;

    const id = seen.has(candidate.id) ? nextOneOffId(result) : candidate.id;
    seen.add(id);
    result.push({ ...candidate, id });
  }

  return result;
}

const ID_PATTERN = /^o(\d+)$/;

/**
 * An id no existing note holds. Pure, like every id in this codebase: derived
 * from the highest in use rather than from a counter or a random source.
 */
export function nextOneOffId(oneoffs: readonly OneOff[]): string {
  const highest = oneoffs.reduce((best, oneoff) => {
    const match = ID_PATTERN.exec(oneoff.id);
    return match ? Math.max(best, Number(match[1])) : best;
  }, 0);
  return `o${highest + 1}`;
}
