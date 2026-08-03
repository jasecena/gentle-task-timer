import { MAX_RUN_ALERTS } from '../alerts/budget';
import { formatDurationLabel } from './format';
import type { Phase, Schedule } from './types';

/**
 * Turning a run into the list of alerts the OS should deliver.
 *
 * The in-app alert path (`phasesEndingBetween`) only fires while JavaScript is
 * running, which on iOS means only while the app is in the foreground. A phase
 * that ends with the screen locked, or with the app backgrounded, is announced
 * by nothing at all. Local notifications close that gap: they are handed to the
 * OS up front, with an absolute fire date each, and iOS delivers them whether
 * the app is foregrounded, backgrounded, suspended or dead.
 *
 * This module stays pure — it produces a *plan*, and the feature layer hands
 * that plan to expo-notifications. Which is what lets every boundary, every
 * piece of copy and the whole cap-and-refill behaviour be tested on Linux.
 */

/**
 * How many alerts a single plan will schedule when nothing else is pending.
 *
 * iOS keeps at most 64 pending local notifications per app — across the whole
 * app, so a weekly schedule and an interval run compete for the same 64. The
 * split lives in `src/core/alerts/budget.ts`; callers with a schedule armed
 * should pass `runAlertBudget(slots)` as the limit rather than taking this
 * default. A long run refills its window on every re-plan, so a smaller share
 * costs reach into the future rather than correctness.
 */
export const MAX_PENDING_ALERTS = MAX_RUN_ALERTS;

/** What an alert announces — named for what *starts*, which is what the copy says. */
export type AlertKind = 'rest-start' | 'work-start' | 'run-end';

/** One notification to be delivered at a wall-clock instant. */
export interface PlannedAlert {
  /**
   * Stable identity for this boundary. Re-planning the same run produces the
   * same key for the same phase, so a rescheduled alert replaces its previous
   * copy instead of duplicating it.
   */
  readonly key: string;
  readonly kind: AlertKind;
  /** Index of the phase that *ends* at this boundary. */
  readonly phaseIndex: number;
  /** Epoch ms at which the alert should fire. */
  readonly fireAtMs: number;
  readonly title: string;
  readonly body: string;
}

export interface AlertPlanInput {
  readonly schedule: Schedule;
  /**
   * Epoch ms corresponding to elapsed time zero for the current run, i.e.
   * `lastResumedAt - accumulatedMs`. Pauses move it forward, which is exactly
   * what makes a re-plan after a pause land on the new boundaries.
   */
  readonly runStartedAtMs: number;
  /** Elapsed run time when planning. Boundaries at or before this have already been announced. */
  readonly elapsedMs: number;
  /** Cap on the number of alerts returned. Defaults to {@link MAX_PENDING_ALERTS}. */
  readonly limit?: number;
}

function pluralizeCycles(count: number): string {
  return count === 1 ? '1 cycle' : `${count} cycles`;
}

function describe(phase: Phase, schedule: Schedule): Pick<PlannedAlert, 'kind' | 'title' | 'body'> {
  const next = schedule.phases[phase.index + 1];

  if (!next) {
    return {
      kind: 'run-end',
      title: 'All done',
      body: `${pluralizeCycles(schedule.totalCycles)} · ${formatDurationLabel(schedule.totalDurationMs)} total`,
    };
  }

  if (next.kind === 'rest') {
    return {
      kind: 'rest-start',
      title: 'Time to rest',
      body: `Cycle ${phase.cycle} of ${schedule.totalCycles} done · ${formatDurationLabel(next.durationMs)} rest`,
    };
  }

  return {
    kind: 'work-start',
    title: 'Back to work',
    body: `Cycle ${next.cycle} of ${schedule.totalCycles} · ${formatDurationLabel(next.durationMs)}`,
  };
}

/**
 * The alerts still to come, in fire order, as absolute wall-clock times.
 *
 * Boundaries at or before `elapsedMs` are omitted: the window that ends at the
 * current elapsed time has already been announced in-app, and scheduling a
 * notification for a moment that has passed would deliver it immediately.
 */
export function planAlerts({
  schedule,
  runStartedAtMs,
  elapsedMs,
  limit = MAX_PENDING_ALERTS,
}: AlertPlanInput): PlannedAlert[] {
  if (!Number.isFinite(runStartedAtMs) || limit <= 0) return [];

  const from = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const alerts: PlannedAlert[] = [];

  for (const phase of schedule.phases) {
    if (phase.endOffsetMs <= from) continue;
    if (alerts.length >= limit) break;

    alerts.push({
      key: `phase-${phase.index}`,
      phaseIndex: phase.index,
      fireAtMs: runStartedAtMs + phase.endOffsetMs,
      ...describe(phase, schedule),
    });
  }

  return alerts;
}
