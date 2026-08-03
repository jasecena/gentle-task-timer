import * as Notifications from 'expo-notifications';

import { soundFileFor } from '@/core/alerts';
import type { ReminderSlot } from '@/core/reminders';
import { ALERT_TAGS, cancelScheduled, replaceScheduled } from '@/services/notifications';

/**
 * Handing a weekly schedule to iOS.
 *
 * The important choice is the trigger type. A dated notification fires once and
 * is gone, so a schedule built from dates would eventually run dry — silently,
 * and only for someone who had not opened the app in a while. A **weekly**
 * trigger repeats indefinitely, so an armed schedule keeps alerting with the
 * app closed, force-quit, or untouched for a month. That is what lets this
 * feature work with no background execution whatsoever.
 *
 * iOS numbers weekdays from 1 = Sunday; the domain uses `Date.getDay()`'s
 * 0 = Sunday. The conversion happens here, at the boundary, and nowhere else.
 */

function toIosWeekday(weekday: number): number {
  return weekday + 1;
}

function toRequest(slot: ReminderSlot): Notifications.NotificationRequestInput {
  return {
    identifier: slot.key,
    content: {
      title: slot.title,
      body: slot.body,
      sound: soundFileFor(slot.soundId) ?? 'default',
      interruptionLevel: 'active',
      data: { tag: ALERT_TAGS.reminder, weekday: slot.weekday, minuteOfDay: slot.minuteOfDay },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: toIosWeekday(slot.weekday),
      hour: slot.hour,
      minute: slot.minute,
    },
  };
}

/** Replaces the pending reminders. A running timer's alerts are left alone. */
export async function scheduleReminders(slots: readonly ReminderSlot[]): Promise<void> {
  await replaceScheduled(ALERT_TAGS.reminder, slots.map(toRequest));
}

/** Stops the schedule: every pending reminder is cancelled, timer alerts untouched. */
export async function cancelReminders(): Promise<void> {
  await cancelScheduled(ALERT_TAGS.reminder);
}
