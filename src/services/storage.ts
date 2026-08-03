import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The app's only persistent store.
 *
 * Everything read back through here goes through a `normalize*` function before
 * it reaches the rest of the app — stored data is untrusted input like any
 * other. It was written by an older build, or edited by a jailbroken device, or
 * truncated by a crash mid-write; the engine's trust boundary
 * (`normalizeConfig`, `normalizeReminderConfig`) exists exactly for this.
 *
 * Reads never throw. A store that cannot be read is indistinguishable from a
 * fresh install as far as the app is concerned, and crashing on launch because
 * a preference file went bad would be a far worse failure than starting empty.
 */

const PREFIX = 'gentle-task-timer/v1/';

export const STORAGE_KEYS = {
  /** The whole run, config included — `TimerState` already carries it. */
  timerRun: `${PREFIX}timer-run`,
  reminders: `${PREFIX}reminders`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Reads and parses a stored value, or null if it is missing or unusable. */
export async function readJson<T>(key: StorageKey): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Discarding unreadable stored value for ${key}`, error);
    return null;
  }
}

/** Writes a value. Failures are logged and swallowed — a lost write is not worth a crash. */
export async function writeJson(key: StorageKey, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not persist ${key}`, error);
  }
}
