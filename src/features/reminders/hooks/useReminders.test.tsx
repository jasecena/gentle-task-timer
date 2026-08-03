import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { DEFAULT_REMINDER_CONFIG, type ReminderConfig } from '@/core/reminders';
import { STORAGE_KEYS } from '@/services/storage';

import { useReminders } from './useReminders';

const mocked = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  __pending: (tag?: string) => { identifier: string; trigger: Record<string, unknown> }[];
  __reset: () => void;
};

/** Hourly, 09:00–17:00, Mondays: nine alerts, comfortably inside the budget. */
const MONDAYS: ReminderConfig = {
  enabled: false,
  intervalMs: 60 * 60_000,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  days: [1],
  vibrationMs: 3_000,
};

beforeEach(async () => {
  jest.clearAllMocks();
  mocked.__reset();
  await AsyncStorage.clear();
});

async function renderReminders() {
  const rendered = await renderHook(() => useReminders());
  await act(async () => {});
  return rendered;
}

describe('useReminders', () => {
  it('schedules nothing until the schedule is explicitly armed', async () => {
    const { result } = await renderReminders();

    await act(async () => {
      result.current.setConfig(MONDAYS);
    });

    expect(mocked.__pending('reminder')).toEqual([]);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('hands every slot to iOS as a weekly repeat when armed', async () => {
    const { result } = await renderReminders();

    await act(async () => {
      result.current.setConfig(MONDAYS);
    });
    await act(async () => {
      result.current.start();
    });

    const pending = mocked.__pending('reminder');
    expect(pending).toHaveLength(9);
    // iOS numbers weekdays from 1 = Sunday, so Monday is 2.
    expect(pending[0]!.trigger).toEqual({ type: 'weekly', weekday: 2, hour: 9, minute: 0 });
    expect(pending[8]!.trigger).toMatchObject({ hour: 17, minute: 0 });
    expect(result.current.config.enabled).toBe(true);
  });

  it('cancels every alert when stopped', async () => {
    const { result } = await renderReminders();

    await act(async () => {
      result.current.setConfig(MONDAYS);
    });
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    expect(mocked.__pending('reminder')).toEqual([]);
    expect(result.current.config.enabled).toBe(false);
  });

  it('leaves a running timer’s alerts alone when it stops', async () => {
    await Notifications.scheduleNotificationAsync({
      identifier: 'phase-0',
      content: { title: 'Time to rest', data: { tag: 'run' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: 1 },
    });
    const { result } = await renderReminders();

    await act(async () => {
      result.current.setConfig(MONDAYS);
    });
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    expect(mocked.__pending('run').map((request) => request.identifier)).toEqual(['phase-0']);
  });

  it('disarms when the schedule is edited, so pending alerts never describe an older arrangement', async () => {
    const { result } = await renderReminders();

    await act(async () => {
      result.current.setConfig(MONDAYS);
    });
    await act(async () => {
      result.current.start();
    });
    expect(mocked.__pending('reminder')).toHaveLength(9);

    await act(async () => {
      result.current.setConfig({ ...MONDAYS, days: [1, 2] });
    });

    expect(result.current.config.enabled).toBe(false);
    expect(mocked.__pending('reminder')).toEqual([]);
  });

  it('refuses to arm a schedule that is over the notification budget', async () => {
    const { result } = await renderReminders();

    // Every 30 minutes, 9–5, five days: 85 alerts a week against a budget of 48.
    await act(async () => {
      result.current.setConfig({ ...MONDAYS, intervalMs: 30 * 60_000, days: [1, 2, 3, 4, 5] });
    });
    await act(async () => {
      result.current.start();
    });

    expect(result.current.slotCount).toBe(85);
    expect(result.current.issues.some((issue) => issue.field === 'budget')).toBe(true);
    expect(mocked.__pending('reminder')).toEqual([]);
  });

  it('arms nothing when notification permission is refused', async () => {
    const refused = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
    mocked.getPermissionsAsync.mockResolvedValue(refused);
    mocked.requestPermissionsAsync.mockResolvedValue(refused);

    const { result } = await renderReminders();
    await act(async () => {
      result.current.setConfig(MONDAYS);
    });
    await act(async () => {
      result.current.start();
    });

    expect(result.current.permission).toBe('denied');
    expect(mocked.__pending('reminder')).toEqual([]);
  });

  it('restores an armed schedule on launch and re-hands it to iOS', async () => {
    // What the store would hold after arming, then force-quitting.
    await AsyncStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify({ ...MONDAYS, enabled: true }));

    const { result } = await renderReminders();

    expect(result.current.config.enabled).toBe(true);
    expect(result.current.config.days).toEqual([1]);
    expect(mocked.__pending('reminder')).toHaveLength(9);
  });

  it('starts from the defaults, disarmed, on a fresh install', async () => {
    const { result } = await renderReminders();

    expect(result.current.config).toEqual({ ...DEFAULT_REMINDER_CONFIG, enabled: false });
    expect(result.current.ready).toBe(true);
    expect(mocked.__pending()).toEqual([]);
  });

  it('does not re-arm a stored schedule that no longer fits the budget', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.reminders,
      JSON.stringify({ ...MONDAYS, enabled: true, intervalMs: 60_000 }),
    );

    const { result } = await renderReminders();

    expect(result.current.issues.some((issue) => issue.field === 'budget')).toBe(true);
    expect(mocked.__pending('reminder')).toEqual([]);
  });
});
