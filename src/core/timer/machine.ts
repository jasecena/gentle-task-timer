import { normalizeConfig } from './config';
import { buildSchedule, completedCyclesAt, findPhaseAt } from './schedule';
import type { Schedule, TimerConfig, TimerProjection, TimerState, TimerStatus } from './types';

/**
 * Timer state transitions.
 *
 * Every function here is pure: it takes the current state plus the current
 * instant and returns a new state. Nothing reads the clock itself. That makes
 * the whole state machine testable with fabricated timestamps, and means a test
 * can fast-forward eight hours without waiting.
 */

export function createTimer(config: TimerConfig): TimerState {
  return { config, status: 'idle', accumulatedMs: 0, lastResumedAt: null };
}

/** Starts a fresh run, discarding any progress. Valid from any status. */
export function start(state: TimerState, now: number): TimerState {
  return { ...state, status: 'running', accumulatedMs: 0, lastResumedAt: now };
}

/** Freezes progress. No-op unless currently running. */
export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  return {
    ...state,
    status: 'paused',
    accumulatedMs: rawElapsedMsAt(state, now),
    lastResumedAt: null,
  };
}

/** Continues from where a pause left off. No-op unless currently paused. */
export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'running', lastResumedAt: now };
}

/** Returns to idle with progress cleared, keeping the config. */
export function reset(state: TimerState): TimerState {
  return { ...state, status: 'idle', accumulatedMs: 0, lastResumedAt: null };
}

/**
 * The single control the UI's primary button needs: start when idle or
 * finished, pause when running, resume when paused.
 */
export function toggle(state: TimerState, now: number): TimerState {
  switch (state.status) {
    case 'running':
      return pause(state, now);
    case 'paused':
      return resume(state, now);
    case 'idle':
    case 'completed':
      return start(state, now);
  }
}

const STATUSES: readonly TimerStatus[] = ['idle', 'running', 'paused', 'completed'];

/**
 * Coerces a stored run back into a state the engine can trust.
 *
 * Persisted state is untrusted input: it was written by an older build, or the
 * device clock has moved since, or a crash truncated the write. Three cases
 * matter and none of them can be left to chance:
 *
 * - **A run marked running with no resume timestamp** cannot be resumed — there
 *   is nothing to measure from — so it degrades to paused, keeping the progress
 *   it had rather than throwing the session away.
 * - **A resume timestamp in the future** means the clock moved backwards while
 *   the app was closed. Left alone it would make elapsed time negative; pinning
 *   it to now costs the user the interval they were away and nothing else.
 * - **Anything unrecognisable** becomes a fresh idle timer rather than an
 *   exception on launch.
 */
export function normalizeState(state: Partial<TimerState> | null | undefined, now: number): TimerState {
  const source = state ?? {};
  const config = normalizeConfig(source.config);

  const accumulatedMs =
    Number.isFinite(source.accumulatedMs) && (source.accumulatedMs as number) > 0
      ? Math.round(source.accumulatedMs as number)
      : 0;

  const status = STATUSES.includes(source.status as TimerStatus) ? (source.status as TimerStatus) : 'idle';

  const lastResumedAt =
    typeof source.lastResumedAt === 'number' && Number.isFinite(source.lastResumedAt)
      ? Math.min(source.lastResumedAt, now)
      : null;

  if (status === 'running' && lastResumedAt === null) {
    return { config, status: 'paused', accumulatedMs, lastResumedAt: null };
  }
  if (status !== 'running' && lastResumedAt !== null) {
    return { config, status, accumulatedMs, lastResumedAt: null };
  }

  return { config, status, accumulatedMs, lastResumedAt };
}

/**
 * Elapsed run time without the upper clamp.
 *
 * The `Math.max(0, ...)` on the running segment guards against the wall clock
 * moving backwards mid-run — an NTP correction or the user editing the device
 * clock. Without it a backwards jump would rewind the timer.
 */
function rawElapsedMsAt(state: TimerState, now: number): number {
  if (state.status !== 'running' || state.lastResumedAt === null) {
    return state.accumulatedMs;
  }
  return state.accumulatedMs + Math.max(0, now - state.lastResumedAt);
}

/** Elapsed run time in ms, clamped to the run's total duration. */
export function elapsedMsAt(state: TimerState, now: number, schedule?: Schedule): number {
  const resolved = schedule ?? buildSchedule(state.config);
  return Math.min(rawElapsedMsAt(state, now), resolved.totalDurationMs);
}

/** True once the run has reached its total duration. */
export function isComplete(state: TimerState, now: number, schedule?: Schedule): boolean {
  if (state.status === 'completed') return true;
  if (state.status === 'idle') return false;
  const resolved = schedule ?? buildSchedule(state.config);
  return rawElapsedMsAt(state, now) >= resolved.totalDurationMs;
}

/**
 * Persists the transition to 'completed' once the run has run out.
 *
 * {@link project} already *reports* completion without this, so the UI is
 * correct either way; calling settle is what makes the stored state stop
 * depending on the clock, so it can be written to disk.
 */
export function settle(state: TimerState, now: number, schedule?: Schedule): TimerState {
  if (state.status !== 'running') return state;
  const resolved = schedule ?? buildSchedule(state.config);
  if (rawElapsedMsAt(state, now) < resolved.totalDurationMs) return state;
  return {
    ...state,
    status: 'completed',
    accumulatedMs: resolved.totalDurationMs,
    lastResumedAt: null,
  };
}

/**
 * Derives everything the UI needs for one instant.
 *
 * Pass a memoized `schedule` when calling this on every frame; otherwise the
 * timeline is rebuilt each time.
 */
export function project(state: TimerState, now: number, schedule?: Schedule): TimerProjection {
  const resolved = schedule ?? buildSchedule(state.config);
  const { totalDurationMs, totalCycles } = resolved;

  const elapsedMs = Math.min(rawElapsedMsAt(state, now), totalDurationMs);
  const finished = state.status === 'completed' || (state.status !== 'idle' && elapsedMs >= totalDurationMs);
  const status = finished ? 'completed' : state.status;

  const phase = status === 'idle' || finished ? null : findPhaseAt(resolved, elapsedMs);
  const phaseElapsedMs = phase ? elapsedMs - phase.startOffsetMs : 0;
  const phaseRemainingMs = phase ? phase.durationMs - phaseElapsedMs : 0;
  const completedCycles = finished ? totalCycles : completedCyclesAt(resolved, elapsedMs);

  return {
    status,
    elapsedMs: status === 'idle' ? 0 : elapsedMs,
    totalDurationMs,
    totalRemainingMs: status === 'idle' ? totalDurationMs : totalDurationMs - elapsedMs,
    phase,
    phaseElapsedMs,
    phaseRemainingMs,
    currentCycle: phase ? phase.cycle : finished ? totalCycles : 1,
    totalCycles,
    completedCycles,
    progress: totalDurationMs === 0 ? 0 : status === 'idle' ? 0 : elapsedMs / totalDurationMs,
  };
}
