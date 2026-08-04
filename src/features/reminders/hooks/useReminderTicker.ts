import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { Weekday } from '@/core/clock';
import { weekMinute } from '@/core/clock';
import { reminderTimesBetween, type ReminderConfig } from '@/core/reminders';

/**
 * Fires a schedule's alerts from the app, for a schedule that hands iOS nothing.
 *
 * The in-app half of the arrangement. In the normal mode this does nothing at all: the alerts
 * are weekly notifications and iOS delivers them whether the app is running or not, which is
 * strictly better. This exists for the mode where the schedule costs no notification slots,
 * bought by only working while the app is open.
 *
 * Built the same way as the timer's alert path, and for the same reason: it fires off
 * **windows**, `(lastChecked, now]`, never off a "is it exactly this minute?" check. A tick
 * that arrives late — and on a phone every tick arrives late — must still report the times it
 * stepped over, or a reminder is silently lost.
 *
 * The interval is coarse on purpose. Reminder times land on whole minutes, so checking four
 * times a minute is three more than necessary; a phone in someone's hand does not need a
 * 100ms loop to notice that 14:30 has happened.
 */
const TICK_MS = 15_000;

function nowWeekMinute(): number {
  const date = new Date();
  return weekMinute(date.getDay() as Weekday, date.getHours() * 60 + date.getMinutes());
}

export function useReminderTicker(config: ReminderConfig, onReminder: () => void): void {
  // Latest-ref, so a fresh inline callback does not restart the interval and lose the
  // watermark with it.
  const callback = useRef(onReminder);
  useEffect(() => {
    callback.current = onReminder;
  });

  const active = config.enabled && !config.notifyWhenClosed;

  /**
   * Where the last check reached, on the weekly grid. Null until the ticker starts, which
   * matters: starting from zero would open a window from Sunday midnight to now and fire every
   * reminder the schedule has ever specified this week, all at once.
   */
  const watermark = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      watermark.current = null;
      return;
    }

    // Arming is not an alert. The first window opens at the moment it starts, so a schedule
    // armed at 14:31 does not immediately announce 14:30.
    watermark.current = nowWeekMinute();

    const check = () => {
      const previous = watermark.current;
      if (previous === null) return;

      const current = nowWeekMinute();
      if (current === previous) return;

      watermark.current = current;
      for (const _time of reminderTimesBetween(config, previous, current)) {
        callback.current();
      }
    };

    const id = setInterval(check, TICK_MS);

    // iOS suspends JS timers the moment the app leaves the foreground, so the interval stops
    // and resumes an arbitrary amount of time later. Checking on return makes the catch-up
    // immediate — though anything crossed while away is genuinely gone, which is the whole
    // trade of this mode and not something a longer window can fix.
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status !== 'active') return;
      // Everything missed while suspended was missed. Resume from now rather than replaying a
      // backlog of alerts nobody can act on.
      watermark.current = nowWeekMinute();
    });

    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, [active, config]);
}
