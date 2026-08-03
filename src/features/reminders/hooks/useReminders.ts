import { useCallback, useEffect, useRef, useState } from 'react';

import {
  countReminderSlots,
  DEFAULT_REMINDER_CONFIG,
  isValidReminderConfig,
  normalizeReminderConfig,
  planReminders,
  validateReminderConfig,
  type ReminderConfig,
  type ReminderIssue,
} from '@/core/reminders';
import { readJson, STORAGE_KEYS, writeJson } from '@/services/storage';

import { requestAlertPermission, type AlertPermission } from '@/services/notifications';
import { cancelReminders, scheduleReminders } from '../alerts';

export interface UseReminders {
  config: ReminderConfig;
  /** Edits the draft. Never schedules anything on its own — arming is explicit. */
  setConfig: (config: ReminderConfig) => void;
  /** Problems with the current draft, including the notification budget. */
  issues: ReminderIssue[];
  /** Alerts a week the current draft costs, for the live count in the editor. */
  slotCount: number;
  /** True once the stored schedule has been read, so the UI does not flash defaults. */
  ready: boolean;
  permission: AlertPermission;
  /** Arms the schedule: asks permission if needed, then hands every slot to iOS. */
  start: () => void;
  /** Stops it: cancels every pending reminder. Timer alerts are untouched. */
  stop: () => void;
}

/**
 * The scheduling mode's state.
 *
 * Two things are deliberate here. First, editing never schedules: a half-typed
 * window would otherwise arm itself and buzz at 3am. Arming is an explicit
 * press, and a schedule with problems cannot be armed at all.
 *
 * Second, an armed schedule is re-handed to iOS on every launch. Rescheduling
 * is idempotent — the slots carry stable keys — so this costs nothing, and it
 * repairs the one case that would otherwise be invisible: notifications lost
 * because the OS dropped them, or because the app was reinstalled.
 */
export function useReminders(): UseReminders {
  const [config, setConfigState] = useState<ReminderConfig>(DEFAULT_REMINDER_CONFIG);
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<AlertPermission>('unknown');

  // Guards the restore: a user who edits during the first read must not have
  // their edit overwritten by what was on disk.
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await readJson<Partial<ReminderConfig>>(STORAGE_KEYS.reminders);
      if (!live) return;
      const restored = normalizeReminderConfig(stored);
      if (!touched.current) setConfigState(restored);
      setReady(true);

      // Re-arm what was armed. Cheap, idempotent, and self-repairing.
      if (restored.enabled && isValidReminderConfig(restored)) {
        await scheduleReminders(planReminders(restored));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const persist = useCallback((next: ReminderConfig) => {
    touched.current = true;
    setConfigState(next);
    void writeJson(STORAGE_KEYS.reminders, next);
  }, []);

  const setConfig = useCallback(
    (next: ReminderConfig) => {
      // Editing an armed schedule disarms it: the pending alerts describe the
      // old arrangement, and leaving them in place while the screen shows the
      // new one would be a lie. The user re-arms when the edit is finished.
      const normalized = normalizeReminderConfig(next);
      if (config.enabled) void cancelReminders();
      persist({ ...normalized, enabled: false });
    },
    [config.enabled, persist],
  );

  const start = useCallback(() => {
    if (!isValidReminderConfig(config)) return;

    void (async () => {
      const granted = await requestAlertPermission();
      setPermission(granted);
      if (granted !== 'granted') return;

      const armed = { ...config, enabled: true };
      persist(armed);
      await scheduleReminders(planReminders(armed));
    })();
  }, [config, persist]);

  const stop = useCallback(() => {
    persist({ ...config, enabled: false });
    void cancelReminders();
  }, [config, persist]);

  return {
    config,
    setConfig,
    issues: validateReminderConfig(config),
    slotCount: countReminderSlots(config),
    ready,
    permission,
    start,
    stop,
  };
}
