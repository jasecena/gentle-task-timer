import { act, renderHook, type RenderHookResult } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { buildSchedule, createTimer, pause, resume, start, type TimerConfig, type TimerState } from '@/core/timer';

import type { AlertPermission } from '../alerts';
import { useTimerAlerts } from './useTimerAlerts';

const CONFIG: TimerConfig = {
  name: 'Timer',
  workDurationMs: 120_000,
  restDurationMs: 30_000,
  repeats: 3,
  vibrationMs: 3_000,
};
const SCHEDULE = buildSchedule(CONFIG);
const NOW = new Date('2026-01-01T00:00:00Z').getTime();

// The mock lives in <rootDir>/__mocks__/expo-notifications.ts and is applied
// automatically; these are its typed handles.
const mocked = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  __pending: (tag?: string) => { identifier: string; trigger: Record<string, unknown> }[];
  __reset: () => void;
};

/** Captured so a test can drive the foreground re-plan without a real app lifecycle. */
let foreground: ((status: AppStateStatus) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.__reset();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);

  foreground = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'change') foreground = handler as (status: AppStateStatus) => void;
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  jest.useRealTimers();
});

type Rendered = RenderHookResult<AlertPermission, { timer: TimerState }>;

/**
 * Renders the hook and lets its effect's async work settle.
 *
 * `renderHook` is asynchronous in this version of the library, as is `rerender`
 * below — not awaiting them leaves the act scope open, and the next render in
 * the file then never runs its effects at all. The extra empty `act` is for the
 * effect's own promise chain: permission first, scheduling second.
 */
async function renderAlerts(state = start(createTimer(CONFIG), NOW)): Promise<Rendered> {
  // Explicit generics: the props type cannot be inferred from `initialProps`.
  const rendered = await renderHook<AlertPermission, { timer: TimerState }>(
    ({ timer }) => useTimerAlerts(timer, SCHEDULE),
    { initialProps: { timer: state } },
  );
  await act(async () => {});
  return rendered;
}

/** Feeds a new timer state to the mounted hook and settles the rescheduling. */
async function update(rendered: Rendered, timer: TimerState) {
  await rendered.rerender({ timer });
  await act(async () => {});
}

/** Fire times of the run alerts iOS is currently holding. */
function pendingFireTimes(): number[] {
  return mocked.__pending('run').map((request) => request.trigger.date as number);
}

describe('useTimerAlerts', () => {
  it('schedules one dated alert per remaining boundary when a run starts', async () => {
    await renderAlerts();

    expect(pendingFireTimes()).toEqual([NOW + 120_000, NOW + 150_000, NOW + 270_000, NOW + 300_000, NOW + 420_000]);

    const [firstRequest] = mocked.scheduleNotificationAsync.mock.calls[0]!;
    expect(firstRequest.content).toMatchObject({
      title: 'Time to rest',
      sound: 'default',
      interruptionLevel: 'active',
    });
    expect(firstRequest.trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DATE);
  });

  it('leaves nothing pending while idle', async () => {
    await renderAlerts(createTimer(CONFIG));

    expect(mocked.__pending()).toEqual([]);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('asks for permission only once the user has started a run', async () => {
    const rendered = await renderAlerts(createTimer(CONFIG));
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();

    await update(rendered, start(createTimer(CONFIG), NOW));
    expect(mocked.getPermissionsAsync).toHaveBeenCalled();
  });

  it('drops pending alerts on pause and re-dates them on resume', async () => {
    const running = start(createTimer(CONFIG), NOW);
    const rendered = await renderAlerts(running);

    const paused = pause(running, NOW + 30_000);
    await update(rendered, paused);
    expect(mocked.__pending('run')).toEqual([]);

    // A minute spent paused, so every remaining boundary moves a minute later.
    jest.setSystemTime(NOW + 90_000);
    await update(rendered, resume(paused, NOW + 90_000));

    expect(pendingFireTimes()).toEqual([NOW + 180_000, NOW + 210_000, NOW + 330_000, NOW + 360_000, NOW + 480_000]);
  });

  it('re-plans on foreground, skipping boundaries that have already passed', async () => {
    await renderAlerts(start(createTimer(CONFIG), NOW));

    // Two and a half minutes in: the first work phase and the first rest are over.
    jest.setSystemTime(NOW + 150_000);
    await act(async () => {
      foreground?.('active');
    });

    expect(pendingFireTimes()).toEqual([NOW + 270_000, NOW + 300_000, NOW + 420_000]);
  });

  it('leaves a standing schedule alone when it reschedules', async () => {
    // A reminder already in the queue, as an armed weekly schedule would be.
    await Notifications.scheduleNotificationAsync({
      identifier: 'reminder-1-540',
      content: { title: 'Reminder', data: { tag: 'reminder' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 2, hour: 9, minute: 0 },
    });

    const running = start(createTimer(CONFIG), NOW);
    const rendered = await renderAlerts(running);
    await update(rendered, pause(running, NOW + 30_000));

    // The run's alerts came and went; the reminder is untouched throughout.
    expect(mocked.__pending('run')).toEqual([]);
    expect(mocked.__pending('reminder').map((request) => request.identifier)).toEqual(['reminder-1-540']);
  });

  it('takes only the slots a standing schedule left free', async () => {
    const longConfig = { ...CONFIG, repeats: 200 };
    await renderHook<AlertPermission, { timer: TimerState }>(
      ({ timer }) => useTimerAlerts(timer, buildSchedule(longConfig), { reminderSlots: 48 }),
      { initialProps: { timer: start(createTimer(longConfig), NOW) } },
    );
    await act(async () => {});

    // 64 total, minus the 48 a full schedule holds.
    expect(mocked.__pending('run')).toHaveLength(16);
  });

  it('reports denied permission and schedules nothing', async () => {
    const refused = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
    mocked.getPermissionsAsync.mockResolvedValueOnce(refused);
    mocked.requestPermissionsAsync.mockResolvedValueOnce(refused);

    const rendered = await renderAlerts();

    expect(rendered.result.current).toBe('denied');
    expect(mocked.__pending('run')).toEqual([]);
  });
});
