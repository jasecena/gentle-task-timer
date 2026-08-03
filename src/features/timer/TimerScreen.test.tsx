import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';

import { TimerScreen } from './TimerScreen';

// Automatically mocked from <rootDir>/__mocks__/expo-notifications.ts.
const notifications = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  __pending: (tag?: string) => unknown[];
  __reset: () => void;
};

// The screen is driven by Date.now(); fake timers let a test walk a three-cycle
// run in milliseconds instead of six and a half minutes.
beforeEach(async () => {
  jest.clearAllMocks();
  notifications.__reset();
  // The screen now persists its run, and the AsyncStorage stand-in keeps its
  // contents for the whole file — so without this, the second test starts with
  // the first test's timer already running.
  await AsyncStorage.clear();

  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Advances both the fake clock and React's timers together.
 *
 * React 19's `act` is asynchronous, so this must be awaited; not awaiting it
 * produces overlapping act scopes and assertions that read stale output.
 */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('TimerScreen', () => {
  it('starts idle showing one work phase and the total run length', async () => {
    await render(<TimerScreen />);

    expect(screen.getByText('READY')).toBeOnTheScreen();
    expect(screen.getByText('02:00')).toBeOnTheScreen();
    expect(screen.getByText('Cycle 1 of 3')).toBeOnTheScreen();
    expect(screen.getByText('7m total · 30s rest')).toBeOnTheScreen();
  });

  it('counts down the work phase once started', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));
    expect(screen.getByText('WORK')).toBeOnTheScreen();

    await advance(10_000);
    expect(screen.getByText('01:50')).toBeOnTheScreen();
  });

  it('holds position while paused and continues on resume', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));
    await advance(30_000);
    expect(screen.getByText('01:30')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Pause'));
    await advance(60_000); // a minute passes while paused
    expect(screen.getByText('01:30')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Resume'));
    await advance(30_000);
    expect(screen.getByText('01:00')).toBeOnTheScreen();
  });

  it('moves into the rest phase when a work phase ends', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));
    await advance(120_000);

    expect(screen.getByText('REST')).toBeOnTheScreen();
    expect(screen.getByText('00:30')).toBeOnTheScreen();
    expect(screen.getByText('Cycle 1 of 3')).toBeOnTheScreen();
  });

  it('reports completion after the final work phase', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));
    await advance(420_000); // 3 x 2min work + 2 x 30s rest

    expect(screen.getByText('DONE')).toBeOnTheScreen();
    expect(screen.getByText('3 of 3 complete')).toBeOnTheScreen();
    expect(screen.getByLabelText('Start again')).toBeOnTheScreen();
  });

  it('returns to idle on reset', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));
    await advance(45_000);
    await fireEvent.press(screen.getByLabelText('Reset'));

    expect(screen.getByText('READY')).toBeOnTheScreen();
    expect(screen.getByText('02:00')).toBeOnTheScreen();
  });

  it('locks the config steppers while running', async () => {
    await render(<TimerScreen />);

    expect(screen.getByLabelText('Increase Repeats')).toBeEnabled();
    await fireEvent.press(screen.getByLabelText('Start'));
    expect(screen.getByLabelText('Increase Repeats')).toBeDisabled();
  });

  it('hands the run to the OS as local notifications when started', async () => {
    await render(<TimerScreen />);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Start'));
    await act(async () => {});

    // Five boundaries: 3 work + 2 rest, the last of which ends the run.
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(5);
    expect(screen.queryByText(/Notifications are off/)).not.toBeOnTheScreen();
  });

  it('explains the limitation when notifications are refused', async () => {
    const refused = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
    notifications.getPermissionsAsync.mockResolvedValueOnce(refused);
    notifications.requestPermissionsAsync.mockResolvedValueOnce(refused);

    await render(<TimerScreen />);
    await fireEvent.press(screen.getByLabelText('Start'));
    await act(async () => {});

    expect(screen.getByText(/Notifications are off/)).toBeOnTheScreen();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('buzzes for the configured length at a phase boundary', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));
    vibrate.mockClear(); // the press itself cancels any buzz in progress
    await advance(120_000);

    // A pattern, not a single pulse: iOS only does fixed-length buzzes, so a
    // 3-second vibration is a train of them.
    const [pattern] = vibrate.mock.calls[0]!;
    expect(Array.isArray(pattern)).toBe(true);
    expect((pattern as number[]).length).toBeGreaterThan(1);
  });

  it('does not buzz at all once vibration is turned off', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await render(<TimerScreen />);

    // Default is 3s: two steps down reaches Off.
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    expect(screen.getByLabelText('Vibration: Off')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Start'));
    vibrate.mockClear();
    await advance(120_000);

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('lets the vibration setting be changed mid-run', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));

    // The durations lock while running; this one cannot invalidate the schedule.
    expect(screen.getByLabelText('Increase Vibration')).toBeEnabled();
    await fireEvent.press(screen.getByLabelText('Increase Vibration'));
    expect(screen.getByLabelText('Vibration: 5s')).toBeOnTheScreen();
  });

  it('stops a buzz in progress when a control is pressed', async () => {
    const cancel = jest.spyOn(Vibration, 'cancel').mockImplementation(() => {});
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Start'));

    expect(cancel).toHaveBeenCalled();
  });

  it('resumes a run that was left going when the app was closed', async () => {
    const first = await render(<TimerScreen />);
    await fireEvent.press(screen.getByLabelText('Start'));
    await advance(45_000);
    expect(screen.getByText('01:15')).toBeOnTheScreen();
    await first.unmount();

    // Half a minute passes with the app closed — the run keeps going, because
    // elapsed time is derived from the clock rather than counted.
    jest.setSystemTime(new Date('2026-01-01T00:01:15Z'));
    await render(<TimerScreen />);
    await act(async () => {});

    expect(screen.getByText('00:45')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pause')).toBeOnTheScreen();
  });

  it('does not replay alerts for boundaries passed while the app was closed', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    const first = await render(<TimerScreen />);
    await fireEvent.press(screen.getByLabelText('Start'));
    await first.unmount();

    // Reopened four minutes in: two boundaries have gone by. Their notifications
    // already fired; buzzing for them now would be a duplicate.
    jest.setSystemTime(new Date('2026-01-01T00:04:00Z'));
    vibrate.mockClear();
    await render(<TimerScreen />);
    await act(async () => {});
    await advance(1_000);

    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.getByText('Cycle 2 of 3')).toBeOnTheScreen();
  });

  it('applies a config change and rebuilds the run', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Increase Repeats'));

    expect(screen.getByText('Cycle 1 of 4')).toBeOnTheScreen();
    expect(screen.getByText('9m 30s total · 30s rest')).toBeOnTheScreen();
  });
});
