import { useCallback, useEffect, useRef, useState } from 'react';

import type { Weekday } from '@/core/clock';
import {
  DEFAULT_ONEOFF,
  isValidOneOff,
  nextOneOffId,
  normalizeOneOff,
  normalizeOneOffs,
  oneOffKey,
  planOneOffs,
  pruneFired,
  validateOneOff,
  type ClockNow,
  type OneOff,
  type OneOffIssue,
} from '@/core/oneoffs';
import { readJson, STORAGE_KEYS, writeJson } from '@/services/storage';

import { cancelOneOff, pendingOneOffKeys, requestAlertPermission, scheduleOneOffs } from '../alerts';
import type { AlertPermission } from '../alerts';

export interface UseOneOffs {
  /** The notes iOS is currently holding, oldest first. */
  oneoffs: OneOff[];
  /** The note being composed. Never scheduled until it is added. */
  draft: OneOff;
  setDraft: (draft: OneOff) => void;
  /** Problems with the draft, including the pending-note budget. */
  issues: OneOffIssue[];
  /** Where the phone's clock is, for the "in 3 days" on each row. Refreshed each minute. */
  now: ClockNow;
  ready: boolean;
  permission: AlertPermission;
  /** Schedules the draft and clears it. Asks permission the first time. */
  add: () => void;
  remove: (id: string) => void;
}

/** Long enough that a row's lead time is never visibly stale, cheap enough to ignore. */
const CLOCK_REFRESH_MS = 30_000;

function readClock(): ClockNow {
  const date = new Date();
  return { weekday: date.getDay() as Weekday, minuteOfDay: date.getHours() * 60 + date.getMinutes() };
}

/**
 * One-off notes.
 *
 * Two things here are worth knowing.
 *
 * **Adding schedules immediately.** Unlike the weekly schedule, there is no arm
 * step: a note with text, a day and a time is complete, and making someone
 * press a second button to mean it would be ceremony. The draft is what is not
 * yet scheduled, which is the same separation by a different name.
 *
 * **Fired notes are pruned by asking iOS, not by checking the clock.** A
 * non-repeating notification leaves the pending list the instant it is
 * delivered, so "iOS is no longer holding it" means "it happened" — no date
 * arithmetic, nothing to get wrong across a daylight-saving change, and it
 * works for notes that fired while the app was closed for a week. A read that
 * *fails* returns null and prunes nothing, because "I could not ask" must never
 * be mistaken for "everything fired".
 */
export function useOneOffs(): UseOneOffs {
  const [oneoffs, setOneOffs] = useState<OneOff[]>([]);
  const [draft, setDraftState] = useState<OneOff>(DEFAULT_ONEOFF);
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<AlertPermission>('unknown');
  const [now, setNow] = useState<ClockNow>(readClock);

  // Guards the restore: a user who starts composing during the first read must
  // not have their draft overwritten by what was on disk.
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await readJson<Partial<OneOff>[]>(STORAGE_KEYS.oneoffs);
      const restored = normalizeOneOffs(stored);
      const pending = await pendingOneOffKeys();
      if (!live) return;

      const surviving = pending === null ? restored : pruneFired(restored, pending);
      setOneOffs(surviving);
      if (!touched.current) setDraftState({ ...DEFAULT_ONEOFF, id: nextOneOffId(surviving) });
      setReady(true);

      if (surviving.length !== restored.length) {
        void writeJson(STORAGE_KEYS.oneoffs, surviving);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Keeps "in 3 days" honest without re-rendering on every frame.
  useEffect(() => {
    const id = setInterval(() => setNow(readClock()), CLOCK_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback((next: OneOff[]) => {
    setOneOffs(next);
    void writeJson(STORAGE_KEYS.oneoffs, next);
  }, []);

  const setDraft = useCallback((next: OneOff) => {
    touched.current = true;
    setDraftState(normalizeOneOff(next, next.id));
  }, []);

  const add = useCallback(() => {
    if (!isValidOneOff(draft, oneoffs.length)) return;

    void (async () => {
      const granted = await requestAlertPermission();
      setPermission(granted);
      if (granted !== 'granted') return;

      const next = [...oneoffs, draft];
      persist(next);
      setDraftState({ ...DEFAULT_ONEOFF, id: nextOneOffId(next) });
      touched.current = false;
      // Re-handing the whole set is idempotent — the keys are stable — and it
      // repairs any note the OS dropped while we were not looking.
      await scheduleOneOffs(planOneOffs(next));
    })();
  }, [draft, oneoffs, persist]);

  const remove = useCallback(
    (id: string) => {
      persist(oneoffs.filter((oneoff) => oneoff.id !== id));
      // Cancel just this one. Replacing the whole tag would work too, but a
      // targeted cancel cannot momentarily drop the others.
      void cancelOneOff(oneOffKey(id));
    },
    [oneoffs, persist],
  );

  return {
    oneoffs,
    draft,
    setDraft,
    issues: validateOneOff(draft, oneoffs.length),
    now,
    ready,
    permission,
    add,
    remove,
  };
}
