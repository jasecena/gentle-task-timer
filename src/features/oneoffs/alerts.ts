import * as Notifications from 'expo-notifications';

import { isSilentSound, soundFileFor } from '@/core/alerts';
import type { OneOffSlot } from '@/core/oneoffs';
import { ALERT_TAGS, cancelOne, pendingKeys, replaceScheduled } from '@/services/notifications';

/**
 * Handing a one-off note to iOS.
 *
 * The trigger type is the whole design. A **non-repeating calendar** trigger
 * takes a weekday and an hour/minute and lets iOS resolve the next matching
 * moment itself, in the phone's own local time. That means:
 *
 * - No date arithmetic here or anywhere in the domain, so there is no stored
 *   instant to be wrong by an hour after the clocks change. "Sunday 09:00"
 *   stays 09:00.
 * - It fires exactly once and then leaves the pending list, which is how the
 *   app knows a note has been delivered — see `pruneFired`.
 *
 * A dated trigger would need the app to compute the moment, and a weekly one
 * would repeat forever, which is the schedule feature and not this one.
 *
 * iOS numbers weekdays from 1 = Sunday; the domain uses `Date.getDay()`'s
 * 0 = Sunday. The conversion happens here, at the boundary, and nowhere else.
 */

function toIosWeekday(weekday: number): number {
  return weekday + 1;
}

function toRequest(slot: OneOffSlot): Notifications.NotificationRequestInput {
  return {
    identifier: slot.key,
    content: {
      title: slot.title,
      body: slot.body,
      sound: isSilentSound(slot.soundId) ? undefined : (soundFileFor(slot.soundId, slot.ringMs) ?? 'default'),
      interruptionLevel: 'active',
      data: { tag: ALERT_TAGS.oneoff, oneOffId: slot.oneOffId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      weekday: toIosWeekday(slot.weekday),
      hour: slot.hour,
      minute: slot.minute,
      second: 0,
      // The one flag that makes this a one-off rather than a second schedule.
      repeats: false,
    },
  };
}

/** Replaces the pending notes. Timer and schedule alerts are left alone. */
export async function scheduleOneOffs(slots: readonly OneOffSlot[]): Promise<void> {
  await replaceScheduled(ALERT_TAGS.oneoff, slots.map(toRequest));
}

/** Cancels exactly one note, leaving every other pending note in place. */
export async function cancelOneOff(key: string): Promise<void> {
  await cancelOne(key);
}

/** The notes iOS is still holding, or null if the list could not be read at all. */
export async function pendingOneOffKeys(): Promise<string[] | null> {
  return pendingKeys(ALERT_TAGS.oneoff);
}

export { requestAlertPermission } from '@/services/notifications';
export type { AlertPermission } from '@/services/notifications';
