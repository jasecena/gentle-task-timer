import { useEffect, useRef, useState } from 'react';

import { normalizeState, type TimerConfig, type TimerState } from '@/core/timer';
import { readJson, STORAGE_KEYS, writeJson } from '@/services/storage';

import { useTimer, type UseTimer, type UseTimerOptions } from './useTimer';

export interface UsePersistedTimer extends UseTimer {
  /** False until the stored run has been read, so the UI does not flash a default and then jump. */
  ready: boolean;
}

/**
 * A timer that survives the app being closed.
 *
 * The run is stored as the same two numbers the engine works in — accumulated
 * milliseconds and a resume timestamp — so restoring it is not a replay. A run
 * force-quit twenty minutes ago comes back twenty minutes further along,
 * because elapsed time was never counted in the first place; it was always
 * derived from the wall clock.
 *
 * Writes happen on state changes only, which means user actions. There is no
 * per-tick write: the stored state is already correct for any later instant.
 */
export function usePersistedTimer(fallbackConfig: TimerConfig, options: UseTimerOptions = {}): UsePersistedTimer {
  const timer = useTimer(fallbackConfig, options);
  const [ready, setReady] = useState(false);

  // Restoring must not clobber an edit made while the read was in flight, and
  // must not write back the fallback config it briefly held.
  const restored = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await readJson<Partial<TimerState>>(STORAGE_KEYS.timerRun);
      if (!live) return;
      if (stored) timer.restore(normalizeState(stored, Date.now()));
      restored.current = true;
      setReady(true);
    })();
    return () => {
      live = false;
    };
    // Mount only: `timer.restore` is stable, and re-reading storage later would
    // undo whatever the user has done since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    void writeJson(STORAGE_KEYS.timerRun, timer.state);
  }, [timer.state]);

  return { ...timer, ready };
}
