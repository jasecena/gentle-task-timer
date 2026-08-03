import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  buildSchedule,
  createTimer,
  phasesEndingBetween,
  project,
  reset as resetTimer,
  settle,
  toggle as toggleTimer,
  type Phase,
  type TimerConfig,
  type TimerProjection,
  type TimerState,
} from '@/core/timer';

/**
 * How often the display is recomputed while running.
 *
 * This governs *rendering* only, never correctness: elapsed time is derived
 * from Date.now() on each pass, so a missed or late interval shows up as a
 * slightly late repaint and never as a drifted timer. 100ms keeps the seconds
 * digit flipping within a tenth of a second of the true boundary.
 */
const TICK_MS = 100;

export interface UseTimerOptions {
  /** Fired once for each phase that ends, in order, including phases that elapsed while backgrounded. */
  onPhaseEnd?: (phase: Phase) => void;
  /** Fired once when the final phase ends. */
  onComplete?: () => void;
}

export interface UseTimer {
  state: TimerState;
  view: TimerProjection;
  config: TimerConfig;
  setConfig: (config: TimerConfig) => void;
  toggle: () => void;
  reset: () => void;
  isRunning: boolean;
}

export function useTimer(initialConfig: TimerConfig, options: UseTimerOptions = {}): UseTimer {
  const [state, setState] = useState<TimerState>(() => createTimer(initialConfig));
  const [now, setNow] = useState<number>(() => Date.now());

  const schedule = useMemo(() => buildSchedule(state.config), [state.config]);

  // Latest-ref pattern, so the effects below never need to re-subscribe just
  // because a caller passed a fresh inline callback. Written in an effect
  // rather than during render, which would be a render side effect.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const view = useMemo(() => project(state, now, schedule), [state, now, schedule]);

  /**
   * Elapsed time at the previous tick. Alerts fire for the window
   * (lastElapsed, currentElapsed], which is what makes them survive
   * backgrounding: if the app is frozen for two minutes, the next tick opens a
   * two-minute window and every boundary inside it is reported, in order.
   */
  const lastElapsedRef = useRef(0);
  const completedRef = useRef(false);

  // `view.status` rather than `state.status`: a run that has reached its total
  // duration projects as completed while the stored state still says running,
  // and ticking on past the end would burn battery for nothing.
  const isTicking = view.status === 'running';

  useEffect(() => {
    if (!isTicking) return;

    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [isTicking]);

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
    const previous = lastElapsedRef.current;
    const current = view.elapsedMs;
    if (current <= previous) return;

    lastElapsedRef.current = current;
    for (const phase of phasesEndingBetween(schedule, previous, current)) {
      callbacks.current.onPhaseEnd?.(phase);
    }
  }, [view.elapsedMs, schedule]);

  useEffect(() => {
    if (view.status !== 'completed' || completedRef.current) return;
    completedRef.current = true;
    callbacks.current.onComplete?.();
  }, [view.status]);

  const rewind = () => {
    lastElapsedRef.current = 0;
    completedRef.current = false;
  };

  const setConfig = useCallback((config: TimerConfig) => {
    rewind();
    setState(createTimer(config));
    setNow(Date.now());
  }, []);

  const toggle = useCallback(() => {
    const instant = Date.now();
    setState((prev) => {
      // Settle first: a finished run still carries status 'running' until
      // something writes the completion down, and toggling that would read as
      // a pause instead of a restart.
      const current = settle(prev, instant, schedule);
      if (current.status === 'idle' || current.status === 'completed') rewind();
      return toggleTimer(current, instant);
    });
    setNow(instant);
  }, [schedule]);

  const reset = useCallback(() => {
    rewind();
    setState(resetTimer);
    setNow(Date.now());
  }, []);

  return { state, view, config: state.config, setConfig, toggle, reset, isRunning: isTicking };
}
