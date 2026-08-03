import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { runAlertBudget } from '@/core/alerts';
import { elapsedMsAt, planAlerts, type Schedule, type TimerState } from '@/core/timer';

import { cancelRunAlerts, requestAlertPermission, scheduleRunAlerts, type AlertPermission } from '../alerts';

export interface UseTimerAlertsOptions {
  /** Slots a standing schedule is holding, so the run only claims what is free of the 64. */
  reminderSlots?: number;
}

/**
 * Keeps the OS's pending run alerts in step with the run.
 *
 * Deliberately driven off `state`, never off the projection: state changes only
 * when the user acts (start, pause, resume, reset, config edit), so this
 * reschedules a handful of times per run rather than ten times a second.
 *
 * It also re-plans on every foreground, which is what refills the window for a
 * run with more boundaries than one plan can hold.
 */
export function useTimerAlerts(
  state: TimerState,
  schedule: Schedule,
  { reminderSlots = 0 }: UseTimerAlertsOptions = {},
): AlertPermission {
  const [permission, setPermission] = useState<AlertPermission>('unknown');
  const [foregroundedAt, setForegroundedAt] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') setForegroundedAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Not running: nothing of ours should be pending. This also cleans up after
    // a run abandoned by force-quitting, because the next launch lands here.
    if (state.status !== 'running' || state.lastResumedAt === null) {
      void cancelRunAlerts();
      return;
    }

    // The effect outlives its own async work — a fast pause-resume can start a
    // second pass before the first finishes — so every await is followed by a
    // liveness check, and the stale pass drops its result.
    let live = true;
    const runStartedAtMs = state.lastResumedAt - state.accumulatedMs;

    void (async () => {
      const granted = await requestAlertPermission();
      if (!live) return;
      setPermission(granted);
      if (granted !== 'granted') return;

      const alerts = planAlerts({
        schedule,
        runStartedAtMs,
        // Read the clock now, not when the effect was queued: the permission
        // prompt can sit on screen for as long as the user takes to answer it,
        // and every boundary passed meanwhile is already gone.
        elapsedMs: elapsedMsAt(state, Date.now(), schedule),
        limit: runAlertBudget(reminderSlots),
      });
      if (!live) return;
      await scheduleRunAlerts(alerts);
    })();

    return () => {
      live = false;
    };
  }, [state, schedule, reminderSlots, foregroundedAt]);

  return permission;
}
