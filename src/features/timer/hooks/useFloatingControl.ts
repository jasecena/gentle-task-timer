import { useCallback, useEffect, useRef, useState } from 'react';

import { readJson, STORAGE_KEYS, writeJson } from '@/services/storage';

/** Shape of the stored preferences blob. Everything in it is optional and untrusted. */
interface StoredPrefs {
  floatingControl?: unknown;
}

export interface UseFloatingControl {
  /** Whether the floating run control should be shown at all. */
  enabled: boolean;
  set: (value: boolean) => void;
}

/**
 * Whether the timers tab shows its floating run control, remembered between launches.
 *
 * On by default: someone who has never touched the switch should see the thing it governs,
 * and a preference that hides a feature until you find the switch hides it forever.
 *
 * The stored value is read as untrusted input like everything else that comes back out of
 * storage — anything that is not a boolean is the default, not a crash and not `false`.
 * Nothing is written until the read has finished, so a slow read cannot overwrite the stored
 * preference with the default it was briefly holding.
 */
export function useFloatingControl(): UseFloatingControl {
  const [enabled, setEnabled] = useState(true);
  const restored = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await readJson<StoredPrefs>(STORAGE_KEYS.timerPrefs);
      if (!live) return;
      if (stored && typeof stored.floatingControl === 'boolean') setEnabled(stored.floatingControl);
      restored.current = true;
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    void writeJson(STORAGE_KEYS.timerPrefs, { floatingControl: enabled });
  }, [enabled]);

  const set = useCallback((value: boolean) => setEnabled(value), []);

  return { enabled, set };
}
