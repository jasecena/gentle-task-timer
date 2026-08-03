import * as Notifications from 'expo-notifications';

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
      sound: 'default',
      interruptionLevel: 'active',
      data: { tag: ALERT_TAGS.run, kind: alert.kind, phaseIndex: alert.phaseIndex },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alert.fireAtMs },
  };
}

/** Replaces the run's pending alerts. A standing schedule's alerts are left alone. */
export async function scheduleRunAlerts(alerts: readonly PlannedAlert[]): Promise<void> {
  await replaceScheduled(ALERT_TAGS.run, alerts.map(toRequest));
}

/** Drops the run's pending alerts. Called whenever the timer is not running. */
export async function cancelRunAlerts(): Promise<void> {
  await cancelScheduled(ALERT_TAGS.run);
}

export { requestAlertPermission } from '@/services/notifications';
export type { AlertPermission } from '@/services/notifications';
