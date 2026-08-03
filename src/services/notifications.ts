import * as Notifications from 'expo-notifications';

/**
 * The one place that talks to expo-notifications.
 *
 * Two features schedule alerts — an interval run and a weekly schedule — and
 * they share a single pool of 64 pending notifications. That makes a blunt
 * `cancelAllScheduledNotificationsAsync` actively dangerous: rescheduling a
 * timer would silently wipe a standing schedule, and the user would find out
 * days later when a reminder failed to arrive. So every notification this app
 * creates carries a `tag`, and cancellation is always tag-scoped.
 *
 * Everything here is failure-tolerant. An alert that cannot be scheduled must
 * never take down the timer that was trying to schedule it.
 *
 * The `expo-notifications` config plugin **is** in app.config.ts, and it writes
 * an `aps-environment` entitlement — which is why the App ID needs the Push
 * Notifications capability even though this app sends no remote push. That was
 * a deliberate trade for bundled alert sounds: a custom sound has to be a file
 * inside the bundle, and the plugin's `sounds` array is the only thing that
 * puts one there. See docs/ARCHITECTURE.md and docs/DEPLOYMENT.md.
 */

/** Which feature an alert belongs to. Stored in the notification's `data`. */
export const ALERT_TAGS = { run: 'run', reminder: 'reminder', oneoff: 'oneoff' } as const;
export type AlertTag = (typeof ALERT_TAGS)[keyof typeof ALERT_TAGS];

/** Whether the OS will deliver this app's alerts. */
export type AlertPermission = 'unknown' | 'granted' | 'denied';

/**
 * By default iOS suppresses a notification whose app is already in front. Every
 * feature here wants the opposite: the alert is the point, foreground or not.
 *
 * The one difference between them is Notification Centre. A phase boundary is
 * worth nothing ten minutes later, so run and schedule alerts are banner-only
 * and do not silt the list up. A **one-off note is the opposite** — someone
 * wrote it down precisely so they could find it again — so it stays in the
 * list. The badge is left alone throughout, because a count of past alerts
 * means nothing.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: notification.request.content.data?.tag === ALERT_TAGS.oneoff,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for notification permission, at the point the user first arms something.
 *
 * Requesting at launch, before there is anything to be notified about, is the
 * reliable way to earn a permanent "Don't Allow" — iOS shows the system prompt
 * exactly once.
 */
export async function requestAlertPermission(): Promise<AlertPermission> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';

    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return requested.granted ? 'granted' : 'denied';
  } catch (error) {
    console.warn('Could not read notification permission', error);
    return 'unknown';
  }
}

/** Every pending notification this app scheduled under `tag`. */
async function pendingFor(tag: AlertTag) {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  return pending.filter((request) => request.content.data?.tag === tag);
}

/**
 * Replaces this tag's pending notifications with exactly `requests`.
 *
 * Cancel-then-schedule rather than reconciling: pausing a run or editing a
 * schedule shifts every future alert, so the old set is never a subset of the
 * new one and diffing them would be more code for the same result.
 */
export async function replaceScheduled(
  tag: AlertTag,
  requests: readonly Notifications.NotificationRequestInput[],
): Promise<void> {
  try {
    await cancelScheduled(tag);
    await Promise.all(requests.map((request) => Notifications.scheduleNotificationAsync(request)));
  } catch (error) {
    console.warn(`Could not schedule ${tag} alerts`, error);
  }
}

/** Drops this tag's pending notifications, leaving the other features' alone. */
export async function cancelScheduled(tag: AlertTag): Promise<void> {
  try {
    const mine = await pendingFor(tag);
    await Promise.all(mine.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
  } catch (error) {
    console.warn(`Could not cancel ${tag} alerts`, error);
  }
}

/** Cancels exactly one notification by identifier. Used to delete a single one-off note. */
export async function cancelOne(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (error) {
    console.warn(`Could not cancel ${identifier}`, error);
  }
}

/**
 * The identifiers this tag currently has pending.
 *
 * Asking the OS what it is holding is how one-off notes work out which of them
 * have already fired: a non-repeating notification leaves the pending list the
 * moment it is delivered, so absence means "it happened". That beats comparing
 * stored timestamps against the clock, which is wrong after a daylight-saving
 * change and after anyone edits the device clock.
 *
 * Returns **null** if the list could not be read, which is not the same as an
 * empty list and must not be confused with one: an empty list means everything
 * fired, and a failed read means we do not know. Treating the second as the
 * first would delete every pending note the first time this call hiccuped.
 */
export async function pendingKeys(tag: AlertTag): Promise<string[] | null> {
  try {
    return (await pendingFor(tag)).map((request) => request.identifier);
  } catch (error) {
    console.warn(`Could not read pending ${tag} alerts`, error);
    return null;
  }
}
