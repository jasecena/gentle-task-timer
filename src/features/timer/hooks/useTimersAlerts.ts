import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { runAlertBudget } from '@/core/alerts';
import { planRunAlerts, type TimerRun } from '@/core/timer';

import { cancelRunAlerts, requestAlertPermission, scheduleRunAlerts, type AlertPermission } from '../alerts';

export interface UseTimersAlertsOptions {
  /** Slots a standing schedule is holding, so runs only claim what is free of the 64. */
  reminderSlots?: number;
  /** Pending one-off notes, which hold a slot each until they fire. */
  oneoffSlots?: number;
}

/**
 * Keeps the OS's pending run alerts in step with every running timer.
 *
 * All timers are planned as **one set**, because iOS counts them as one set:
 * there is a single pool of 64 pending notifications, and `planRunAlerts`
 * shares whatever is free between the runs that want it. Planning each timer
 * independently would have the last one to schedule quietly overrun the
 * ceiling, and iOS drops the overflow without saying so.
 *
 * Deliberately driven off `runs`, never off the projections: run state changes
 * only when the user acts (start, pause, resume, reset, config edit), so this
 * reschedules a handful of times per run rather than ten times a second.
 *
 * It also re-plans on every foreground, which is what refills the window for
 * runs with more boundaries than one plan can hold.
 */
export function useTimersAlerts(
  runs: readonly TimerRun[],
  { reminderSlots = 0, oneoffSlots = 0 }: UseTimersAlertsOptions = {},
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
    const anyRunning = runs.some((run) => run.state.status === 'running' && run.state.lastResumedAt !== null);

    // Nothing running: nothing of ours should be pending. This also cleans up
    // after a run abandoned by force-quitting, because the next launch lands
    // here.
    if (!anyRunning) {
      void cancelRunAlerts();
      return;
    }

    // The effect outlives its own async work — a fast pause-resume can start a
    // second pass before the first finishes — so every await is followed by a
    // liveness check, and the stale pass drops its result.
    let live = true;

    void (async () => {
      const granted = await requestAlertPermission();
      if (!live) return;
      setPermission(granted);
      if (granted !== 'granted') return;

      const alerts = planRunAlerts(
        runs,
        // Read the clock now, not when the effect was queued: the permission
        // prompt can sit on screen for as long as the user takes to answer it,
        // and every boundary passed meanwhile is already gone.
        Date.now(),
        runAlertBudget(reminderSlots, oneoffSlots),
      );
      if (!live) return;
      await scheduleRunAlerts(alerts);
    })();

    return () => {
      live = false;
    };
  }, [runs, reminderSlots, oneoffSlots, foregroundedAt]);

  return permission;
}
