import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Vibration } from 'react-native';

import { buildVibrationPattern, normalizeVibrationMs } from '@/core/alerts';
import { ALERT_TAGS } from '@/services/notifications';

/**
 * Runs the vibration train when a schedule alert or a one-off note arrives.
 *
 * This closes a real gap. Until it existed, `Vibration.vibrate` was called in exactly one file
 * — the timer screen, from `onPhaseEnd` — so the vibration setting on the Schedule and Once
 * tabs was stored, shown, and never read. The ring worked, because the sound rides on the
 * notification and iOS plays it; the buzz did not, because a buzz of a chosen length is a
 * *train* of pulses driven from JavaScript, and nothing was listening for the notification
 * that should have started it.
 *
 * ## Why the timer is deliberately not handled here
 *
 * A run's boundaries already vibrate from the engine, off elapsed-time windows. That path is
 * strictly better: it fires even when the notification is suppressed, and it survives the app
 * being frozen and catching up. Vibrating here as well would simply buzz twice for the same
 * boundary. So this listener ignores the `run` tag on purpose.
 *
 * ## What this does and does not fix
 *
 * It makes the setting work **with the app in the foreground**, which is exactly what the
 * setting has always claimed and all it can ever mean. With the app closed there is no
 * JavaScript to run a train, so iOS gives its own single buzz and no setting changes that.
 * That limit is the platform's and is documented in docs/ARCHITECTURE.md; this fixes the half
 * that was ours.
 */
export function useArrivalVibration(): void {
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const tag = data?.tag;

      // The run tag has its own, better path. Anything unrecognised is left alone rather than
      // buzzed at: a notification this build does not understand should be silent, not noisy.
      if (tag !== ALERT_TAGS.reminder && tag !== ALERT_TAGS.oneoff) return;

      // The length travels on the notification because this may fire days after it was armed.
      // An absent value means a notification scheduled by an older build; normalizing it lands
      // on "off", which is the right way to be wrong — a missed buzz rather than a surprise one.
      const pattern = buildVibrationPattern(normalizeVibrationMs(data?.vibrationMs as number));
      if (pattern.length === 0) return;

      Vibration.vibrate(pattern);
    });

    return () => subscription.remove();
  }, []);
}
