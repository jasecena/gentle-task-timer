import { planAlerts, type PlannedAlert } from './alerts';
import { LIMITS, normalizeConfig } from './config';
import { createTimer, elapsedMsAt, normalizeState } from './machine';
import { buildSchedule } from './schedule';
import type { TimerConfig, TimerState } from './types';

/**
 * Several timers at once.
 *
 * The engine underneath is unchanged — every function in `machine.ts` is still
 * a pure `(state, now) => state`, and a run is still two numbers. This module
 * only adds identity and a list, which is all "parallel timers" actually
 * requires when nothing counts down in the first place. Ten timers cost ten
 * projections per repaint and no extra clocks.
 *
 * The one genuinely new problem is the notification budget: iOS holds 64
 * pending alerts app-wide, so N runs cannot each plan as though they were
 * alone. {@link planRunAlerts} is where that is settled.
 */

export interface TimerRun {
  /** Stable identity. Namespaces this run's notification keys and its stored state. */
  readonly id: string;
  readonly state: TimerState;
}

/**
 * How many timers may exist at once.
 *
 * Bounded by the notification budget rather than by the screen: eight running
 * timers sharing ~60 slots is seven boundaries of lookahead each, which still
 * covers a normal run between foregrounds. Sixteen would not.
 */
export const MAX_RUNS = 8;

const ID_PATTERN = /^t(\d+)$/;

/**
 * An id no existing run holds.
 *
 * Derived from the highest id in use rather than from a counter or a random
 * value, which keeps it a pure function — `src/core` reads no clock and no
 * entropy source, so this is as testable as everything around it. Ids are never
 * reused, so a deleted timer's stale notifications can never be adopted by its
 * replacement.
 */
export function nextRunId(runs: readonly TimerRun[]): string {
  const highest = runs.reduce((best, run) => {
    const match = ID_PATTERN.exec(run.id);
    return match ? Math.max(best, Number(match[1])) : best;
  }, 0);
  return `t${highest + 1}`;
}

export function createRun(id: string, config: TimerConfig): TimerRun {
  return { id, state: createTimer(normalizeConfig(config)) };
}

export function findRun(runs: readonly TimerRun[], id: string): TimerRun | undefined {
  return runs.find((run) => run.id === id);
}

/**
 * A name no existing run is using, by appending a number if it has to.
 *
 * Two timers called the same thing would be genuinely ambiguous rather than
 * merely untidy: the name is the *title* of every alert a run posts, so
 * identical names mean a banner that cannot tell you which timer just finished.
 * The user is free to rename either one afterwards; this only stops the default
 * from being ambiguous.
 */
export function uniqueRunName(runs: readonly TimerRun[], base: string): string {
  const taken = new Set(runs.map((run) => run.state.config.name));
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`.slice(0, LIMITS.MAX_NAME_LENGTH);
    if (!taken.has(candidate)) return candidate;
  }
}

/** Appends a fresh timer, named so it cannot be confused with one already there. */
export function addRun(runs: readonly TimerRun[], config: TimerConfig): TimerRun[] {
  if (runs.length >= MAX_RUNS) return [...runs];
  return [...runs, createRun(nextRunId(runs), { ...config, name: uniqueRunName(runs, config.name) })];
}

/**
 * Drops a timer, but never the last one.
 *
 * An empty list would mean a screen with nothing on it and no obvious way back,
 * so the floor is one. Someone who wants rid of their only timer edits it.
 */
export function removeRun(runs: readonly TimerRun[], id: string): TimerRun[] {
  if (runs.length <= 1) return [...runs];
  return runs.filter((run) => run.id !== id);
}

/** Applies a transition to one run, leaving the rest exactly as they were. */
export function updateRun(
  runs: readonly TimerRun[],
  id: string,
  transition: (state: TimerState) => TimerState,
): TimerRun[] {
  return runs.map((run) => (run.id === id ? { ...run, state: transition(run.state) } : run));
}

/** Runs that are actually counting down — what the keep-awake lock and the budget care about. */
export function runningRuns(runs: readonly TimerRun[]): TimerRun[] {
  return runs.filter((run) => run.state.status === 'running' && run.state.lastResumedAt !== null);
}

/**
 * Coerces stored input into a list the app can trust.
 *
 * Same contract as `normalizeState`, one level up: an unreadable store is a
 * fresh install, and anything structurally wrong is repaired rather than
 * thrown. Three cases are worth naming.
 *
 * - **A duplicate id** is reassigned, not dropped. Two runs sharing an id would
 *   share notification keys, and one would silently cancel the other's alerts.
 * - **More than {@link MAX_RUNS}** keeps the first few. The overflow could only
 *   have come from a build with a higher ceiling, and the alternative — loading
 *   them and quietly overspending the notification budget — fails invisibly.
 * - **An empty list** becomes one default timer, so the screen is never blank.
 */
export function normalizeRuns(
  // Deliberately looser than `Partial<TimerRun>`: this is what came off disk,
  // so the id may not be a string and the state may be half a state.
  input: readonly { id?: unknown; state?: Partial<TimerState> | null }[] | null | undefined,
  now: number,
  fallbackConfig: TimerConfig,
): TimerRun[] {
  const source = Array.isArray(input) ? input.slice(0, MAX_RUNS) : [];
  const runs: TimerRun[] = [];
  const seen = new Set<string>();

  for (const entry of source) {
    if (entry === null || typeof entry !== 'object') continue;

    const state = normalizeState(entry.state, now);
    const id = typeof entry.id === 'string' && ID_PATTERN.test(entry.id) && !seen.has(entry.id) ? entry.id : null;
    const resolved = id ?? nextRunId(runs);

    seen.add(resolved);
    runs.push({ id: resolved, state });
  }

  return runs.length > 0 ? runs : [createRun('t1', fallbackConfig)];
}

/**
 * The notifications every running timer should have pending, sharing one budget.
 *
 * The split is **round-robin, not chronological**, and that is the whole point.
 * Taking the next `limit` alerts by fire time sounds obviously right and is
 * quietly broken: start a 999-cycle one-minute timer next to a two-hour one and
 * the fast timer's boundaries fill the entire budget, so the two-hour timer —
 * the one you actually cannot sit and watch — never alerts at all. Dealing one
 * alert to each run in turn guarantees every running timer gets its *next*
 * boundary before any run gets its second.
 *
 * Depth is the thing being traded away, and it is the cheap one: the plan is
 * rebuilt on every state change and every foreground, so a run that only got
 * seven boundaries this time gets seven more before it needs them.
 *
 * The result is sorted by fire time, which changes nothing for iOS and makes
 * the function readable in a test.
 */
export function planRunAlerts(runs: readonly TimerRun[], now: number, limit: number): PlannedAlert[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const queues = runningRuns(runs)
    .map((run) => {
      const schedule = buildSchedule(run.state.config);
      return planAlerts({
        schedule,
        runId: run.id,
        name: run.state.config.name,
        soundId: run.state.config.soundId,
        ringMs: run.state.config.ringMs,
        restEndAlert: run.state.config.restEndAlert,
        // Elapsed zero for this run. Pauses move it forward, which is what
        // makes a re-plan after a pause land on the new boundaries.
        runStartedAtMs: run.state.lastResumedAt! - run.state.accumulatedMs,
        elapsedMs: elapsedMsAt(run.state, now, schedule),
        limit,
      });
    })
    .filter((queue) => queue.length > 0);

  const taken: PlannedAlert[] = [];
  for (let round = 0; taken.length < limit; round += 1) {
    const before = taken.length;
    for (const queue of queues) {
      if (taken.length >= limit) break;
      const alert = queue[round];
      if (alert) taken.push(alert);
    }
    // A whole pass that took nothing means every queue is exhausted.
    if (taken.length === before) break;
  }

  return taken.sort((a, b) => a.fireAtMs - b.fireAtMs || a.key.localeCompare(b.key));
}
