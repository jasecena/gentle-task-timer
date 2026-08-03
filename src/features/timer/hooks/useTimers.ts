import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  addRun as addRunTo,
  buildSchedule,
  createRun,
  elapsedMsAt,
  MAX_RUNS,
  normalizeRuns,
  normalizeState,
  phasesEndingBetween,
  project,
  removeRun as removeRunFrom,
  reset as resetTimer,
  settle,
  toggle as toggleTimer,
  updateRun,
  type Phase,
  type Schedule,
  type TimerConfig,
  type TimerProjection,
  type TimerRun,
  type TimerState,
} from '@/core/timer';
import { readJson, STORAGE_KEYS, writeJson } from '@/services/storage';

/**
 * How often the display is recomputed while anything is running.
 *
 * This governs *rendering* only, never correctness: every run's elapsed time is
 * derived from `Date.now()` on each pass, so a missed or late interval shows up
 * as a slightly late repaint and never as a drifted timer. One interval drives
 * every timer on screen — eight timers cost eight projections per tick, not
 * eight clocks.
 */
const TICK_MS = 100;

/** What a run looks like to the UI: its state, its timeline and its current instant. */
export interface TimerRunView {
  readonly id: string;
  readonly state: TimerState;
  readonly config: TimerConfig;
  readonly schedule: Schedule;
  readonly view: TimerProjection;
}

export interface UseTimersOptions {
  /** Fired once per phase that ends, in order, including phases that elapsed while backgrounded. */
  onPhaseEnd?: (run: TimerRun, phase: Phase) => void;
  /** Fired once when a run's final phase ends. */
  onComplete?: (run: TimerRun) => void;
}

export interface UseTimers {
  runs: TimerRun[];
  /** Everything the screen renders, one entry per timer, in list order. */
  views: TimerRunView[];
  /** False until the stored timers have been read, so the UI does not flash a default and then jump. */
  ready: boolean;
  /** True while any timer is counting down — what the keep-awake lock follows. */
  anyRunning: boolean;
  canAdd: boolean;
  canRemove: boolean;
  add: () => void;
  remove: (id: string) => void;
  setConfig: (id: string, config: TimerConfig) => void;
  toggle: (id: string) => void;
  reset: (id: string) => void;
}

/**
 * Every timer, at once.
 *
 * The engine underneath did not have to change to support this, and that is the
 * point of it being pure: a run was already two numbers and a set of `(state,
 * now) => state` functions, so N runs are a list and one shared clock. Nothing
 * counts down, so nothing competes.
 *
 * Three things are deliberate.
 *
 * **One interval, one `now`.** Per-timer intervals would multiply the wake-ups
 * for no gain, since a repaint has to redraw the whole list anyway.
 *
 * **A watermark per run**, so alerts fire off elapsed-time windows exactly as
 * they did for one timer: `(lastElapsed, currentElapsed]` per run, which is
 * what makes a boundary that passed while the app was suspended still fire, and
 * fire once.
 *
 * **Writes on state changes only** — user actions. There is no per-tick write:
 * the stored state is already correct for any later instant.
 */
export function useTimers(fallbackConfig: TimerConfig, options: UseTimersOptions = {}): UseTimers {
  const [runs, setRuns] = useState<TimerRun[]>(() => [createRun('t1', fallbackConfig)]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [ready, setReady] = useState(false);

  // Latest-ref pattern, so the effects below never re-subscribe just because a
  // caller passed a fresh inline callback. Written in an effect rather than
  // during render, which would be a render side effect.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  // Restoring must not clobber an edit made while the read was in flight, and
  // must not write back the fallback config it briefly held.
  const restored = useRef(false);

  const views = useMemo<TimerRunView[]>(
    () =>
      runs.map((run) => {
        const schedule = buildSchedule(run.state.config);
        return {
          id: run.id,
          state: run.state,
          config: run.state.config,
          schedule,
          view: project(run.state, now, schedule),
        };
      }),
    [runs, now],
  );

  /**
   * Elapsed time at the previous tick, per run. Alerts fire for the window
   * (lastElapsed, currentElapsed], which is what makes them survive
   * backgrounding: if the app is frozen for two minutes, the next tick opens a
   * two-minute window per run and every boundary inside it is reported, in
   * order.
   */
  const watermarks = useRef(new Map<string, number>());
  const completed = useRef(new Set<string>());

  // `view.status` rather than `state.status`: a run that has reached its total
  // duration projects as completed while the stored state still says running,
  // and ticking on past the end would burn battery for nothing.
  const anyRunning = views.some((entry) => entry.view.status === 'running');

  useEffect(() => {
    if (!anyRunning) return;

    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [anyRunning]);

  /**
   * iOS suspends JS timers in the background, so the interval above stops
   * firing and resumes an arbitrary amount of time later. Recomputing on
   * foreground makes the catch-up immediate rather than waiting for the first
   * post-resume tick.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  // Alerts. Driven off elapsed time rather than off the render, so no boundary
  // is missed and none is fired twice.
  useEffect(() => {
    for (const entry of views) {
      const previous = watermarks.current.get(entry.id) ?? 0;
      const current = entry.view.elapsedMs;
      if (current <= previous) continue;

      watermarks.current.set(entry.id, current);
      const run: TimerRun = { id: entry.id, state: entry.state };
      for (const phase of phasesEndingBetween(entry.schedule, previous, current)) {
        callbacks.current.onPhaseEnd?.(run, phase);
      }
    }
  }, [views]);

  useEffect(() => {
    for (const entry of views) {
      if (entry.view.status !== 'completed' || completed.current.has(entry.id)) continue;
      completed.current.add(entry.id);
      callbacks.current.onComplete?.({ id: entry.id, state: entry.state });
    }
  }, [views]);

  const rewind = useCallback((id: string) => {
    watermarks.current.set(id, 0);
    completed.current.delete(id);
  }, []);

  /**
   * Reads the stored timers, upgrading a single v0.2 run into a list on the way.
   *
   * The watermark for each restored run is moved to its restored elapsed time
   * rather than left at zero. Without that, the first tick after a restore
   * would open a window of `(0, elapsed]` and fire an alert for every boundary
   * the run has already passed: reopen a 20-minute-old run and the phone buzzes
   * forty times.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const instant = Date.now();
      const stored = await readJson<Partial<TimerRun>[]>(STORAGE_KEYS.timerRuns);
      const legacy = stored ? null : await readJson<Partial<TimerState>>(STORAGE_KEYS.legacyTimerRun);
      if (!live) return;

      const restoredRuns = stored
        ? normalizeRuns(stored, instant, fallbackConfig)
        : legacy
          ? [{ id: 't1', state: normalizeState(legacy, instant) }]
          : null;

      if (restoredRuns) {
        for (const run of restoredRuns) {
          watermarks.current.set(run.id, elapsedMsAt(run.state, instant));
        }
        completed.current.clear();
        setRuns(restoredRuns);
        setNow(instant);
      }

      restored.current = true;
      setReady(true);
    })();
    return () => {
      live = false;
    };
    // Mount only: re-reading storage later would undo whatever the user has
    // done since. `fallbackConfig` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    void writeJson(STORAGE_KEYS.timerRuns, runs);
  }, [runs]);

  const add = useCallback(() => {
    setRuns((previous) => addRunTo(previous, fallbackConfig));
    setNow(Date.now());
  }, [fallbackConfig]);

  const remove = useCallback(
    (id: string) => {
      rewind(id);
      setRuns((previous) => removeRunFrom(previous, id));
    },
    [rewind],
  );

  const setConfig = useCallback(
    (id: string, config: TimerConfig) => {
      rewind(id);
      // A config edit restarts the run it belongs to: the timeline it was
      // following no longer exists. Every other timer is untouched.
      setRuns((previous) => updateRun(previous, id, () => createRun(id, config).state));
      setNow(Date.now());
    },
    [rewind],
  );

  const toggle = useCallback(
    (id: string) => {
      const instant = Date.now();
      setRuns((previous) =>
        updateRun(previous, id, (state) => {
          // Settle first: a finished run still carries status 'running' until
          // something writes the completion down, and toggling that would read
          // as a pause instead of a restart.
          const current = settle(state, instant, buildSchedule(state.config));
          if (current.status === 'idle' || current.status === 'completed') rewind(id);
          return toggleTimer(current, instant);
        }),
      );
      setNow(instant);
    },
    [rewind],
  );

  const reset = useCallback(
    (id: string) => {
      rewind(id);
      setRuns((previous) => updateRun(previous, id, resetTimer));
      setNow(Date.now());
    },
    [rewind],
  );

  return {
    runs,
    views,
    ready,
    anyRunning,
    canAdd: runs.length < MAX_RUNS,
    canRemove: runs.length > 1,
    add,
    remove,
    setConfig,
    toggle,
    reset,
  };
}
