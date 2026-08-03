import * as Notifications from 'expo-notifications';

import { soundFileFor } from '@/core/alerts';
import type { PlannedAlert } from '@/core/timer';
import { ALERT_TAGS, cancelScheduled, replaceScheduled } from '@/services/notifications';

/**
 * Interval-run alerts: the notification half of a phase boundary.
 *
 * The in-app path (vibration, driven by `phasesEndingBetween`) only reaches the
 * user with the app in front. These reach them with it closed. The plan itself
 * — which boundaries, what they say — comes from `planAlerts` in the pure
 * engine; this only performs it.
 *
 * `interruptionLevel: 'active'` is the default level, chosen explicitly: the
 * 'timeSensitive' level breaks through Focus modes but needs the Time Sensitive
 * Notifications entitlement, which would mean a capability on the App ID.
 */

function toRequest(alert: PlannedAlert): Notifications.NotificationRequestInput {
  return {
    identifier: alert.key,
    content: {
      title: alert.title,
      body: alert.body,
      // A bundled filename, or 'default' for iOS's own sound. The files are put
      // in the bundle by the expo-notifications plugin's `sounds` array; a name
      // iOS cannot resolve is delivered silently, which is why `soundFileFor`
      // falls back rather than passing an unknown id through.
      sound: soundFileFor(alert.soundId) ?? 'default',
      interruptionLevel: 'active',
      data: { tag: ALERT_TAGS.run, runId: alert.runId, kind: alert.kind, phaseIndex: alert.phaseIndex },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alert.fireAtMs },
  };
}

/**
 * Replaces every running timer's pending alerts in one call.
 *
 * One call for all of them, not one per timer: the plan is built across runs so
 * they share the budget, and replacing the whole `run` tag at once is what
 * makes a stopped timer's alerts disappear without a separate cancel. A
 * standing schedule's alerts and any pending notes are left alone.
 */
export async function scheduleRunAlerts(alerts: readonly PlannedAlert[]): Promise<void> {
  await replaceScheduled(ALERT_TAGS.run, alerts.map(toRequest));
}

/** Drops every run's pending alerts. Called whenever no timer is running. */
export async function cancelRunAlerts(): Promise<void> {
  await cancelScheduled(ALERT_TAGS.run);
}

export { requestAlertPermission } from '@/services/notifications';
export type { AlertPermission } from '@/services/notifications';
