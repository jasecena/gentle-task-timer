import type { Phase, Schedule, TimerConfig } from './types';

/**
 * Expands a config into its full timeline.
 *
 * The result is a pure function of the config, with every phase pre-positioned
 * by offset from run start. Once you have a schedule, answering "what should be
 * happening at elapsed time T?" is a lookup rather than a simulation — which is
 * precisely what lets the app recover its exact state after being backgrounded,
 * suspended or killed.
 */
export function buildSchedule(config: TimerConfig): Schedule {
  const phases: Phase[] = [];
  const hasRest = config.restDurationMs > 0;
  let offset = 0;
  let index = 0;

  for (let cycle = 1; cycle <= config.repeats; cycle += 1) {
    phases.push({
      kind: 'work',
      index: index++,
      cycle,
      startOffsetMs: offset,
      durationMs: config.workDurationMs,
      endOffsetMs: offset + config.workDurationMs,
    });
    offset += config.workDurationMs;

    // No trailing rest: the run ends the instant the final work phase does.
    const isLastCycle = cycle === config.repeats;
    if (hasRest && !isLastCycle) {
      phases.push({
        kind: 'rest',
        index: index++,
        cycle,
        startOffsetMs: offset,
        durationMs: config.restDurationMs,
        endOffsetMs: offset + config.restDurationMs,
      });
      offset += config.restDurationMs;
    }
  }

  return {
    phases,
    totalDurationMs: offset,
    totalCycles: config.repeats,
  };
}

/**
 * The phase in progress at `elapsedMs`, or null if the run is over.
 *
 * A phase owns the half-open interval `[startOffsetMs, endOffsetMs)`, so an
 * elapsed time landing exactly on a boundary belongs to the phase that is
 * starting, not the one that just ended.
 */
export function findPhaseAt(schedule: Schedule, elapsedMs: number): Phase | null {
  if (schedule.phases.length === 0) return null;
  if (elapsedMs >= schedule.totalDurationMs) return null;

  const target = Math.max(0, elapsedMs);

  // Binary search: schedules can hold up to ~2000 phases and this is called on
  // every frame of the countdown.
  let low = 0;
  let high = schedule.phases.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const phase = schedule.phases[mid]!;
    if (target < phase.startOffsetMs) {
      high = mid - 1;
    } else if (target >= phase.endOffsetMs) {
      low = mid + 1;
    } else {
      return phase;
    }
  }
  return null;
}

/**
 * Every phase that *finished* in the elapsed-time window `(fromMs, toMs]`.
 *
 * This is the alert trigger. Driving alerts off elapsed-time windows rather off
 * a per-frame "did the countdown hit zero?" check means no boundary is ever
 * missed, even if the app was frozen for a minute and several phases went by
 * between two consecutive ticks.
 *
 * The window is open at the bottom and closed at the top so that feeding it
 * consecutive windows — (a, b] then (b, c] — fires each boundary exactly once.
 */
export function phasesEndingBetween(schedule: Schedule, fromMs: number, toMs: number): Phase[] {
  if (toMs <= fromMs) return [];
  return schedule.phases.filter((phase) => phase.endOffsetMs > fromMs && phase.endOffsetMs <= toMs);
}

/** Number of work phases fully completed at `elapsedMs`. */
export function completedCyclesAt(schedule: Schedule, elapsedMs: number): number {
  let completed = 0;
  for (const phase of schedule.phases) {
    if (phase.kind === 'work' && phase.endOffsetMs <= elapsedMs) completed += 1;
  }
  return completed;
}
