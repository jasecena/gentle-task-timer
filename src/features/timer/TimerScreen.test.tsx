import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';

import { TimerScreen } from './TimerScreen';

// Automatically mocked from <rootDir>/__mocks__/expo-notifications.ts.
/** The mock's own granted fixture, reinstated before each test. */
const GRANTED = (Notifications as unknown as { granted: unknown }).granted;

const notifications = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  __pending: (tag?: string) => { identifier: string; content: Record<string, unknown> }[];
  __reset: () => void;
};

/** The first timer's name, which every one of its controls is labelled with. */
const A = 'Gentle Task Timer';
/** The second timer's, auto-numbered so two timers are never ambiguous. */
const B = 'Gentle Task Timer 2';

// The screen is driven by Date.now(); fake timers let a test walk a three-cycle
// run in milliseconds instead of six and a half minutes.
beforeEach(async () => {
  jest.clearAllMocks();
  notifications.__reset();
  // `clearAllMocks` clears call history but not implementations, so a test that
  // stubs permission as denied would otherwise leave it denied for every test
  // after it. Granted is the default; the denial tests opt out for themselves.
  notifications.getPermissionsAsync.mockResolvedValue(GRANTED);
  notifications.requestPermissionsAsync.mockResolvedValue(GRANTED);
  // The screen persists its timers, and the AsyncStorage stand-in keeps its
  // contents for the whole file — so without this, the second test starts with
  // the first test's timers already running.
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

/** Renders and lets the restore-from-storage effect settle. */
async function renderScreen() {
  const rendered = await render(<TimerScreen />);
  await act(async () => {});
  return rendered;
}

/** Opens a card's settings, which live behind a disclosure now that cards are a list. */
async function openSettings(name: string) {
  await fireEvent.press(screen.getByLabelText(`Show settings for ${name}`));
}

describe('a single timer', () => {
  it('starts idle showing one work phase and the total run length', async () => {
    await renderScreen();

    expect(screen.getByText('READY')).toBeOnTheScreen();
    expect(screen.getByText('02:00')).toBeOnTheScreen();
    expect(screen.getByText('Cycle 1 of 3')).toBeOnTheScreen();
    expect(screen.getByText('7m total · 30s rest')).toBeOnTheScreen();
  });

  it('counts down the work phase once started', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    expect(screen.getByText('WORK')).toBeOnTheScreen();

    await advance(10_000);
    expect(screen.getByText('01:50')).toBeOnTheScreen();
  });

  it('holds position while paused and continues on resume', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(30_000);
    expect(screen.getByText('01:30')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(`Pause ${A}`));
    await advance(60_000); // a minute passes while paused
    expect(screen.getByText('01:30')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(`Resume ${A}`));
    await advance(30_000);
    expect(screen.getByText('01:00')).toBeOnTheScreen();
  });

  it('moves into the rest phase when a work phase ends', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(120_000);

    expect(screen.getByText('REST')).toBeOnTheScreen();
    expect(screen.getByText('00:30')).toBeOnTheScreen();
    expect(screen.getByText('Cycle 1 of 3')).toBeOnTheScreen();
  });

  it('reports completion after the final work phase', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(420_000); // 3 x 2min work + 2 x 30s rest

    expect(screen.getByText('DONE')).toBeOnTheScreen();
    expect(screen.getByText('3 of 3 complete')).toBeOnTheScreen();
    expect(screen.getByLabelText(`Start again ${A}`)).toBeOnTheScreen();
  });

  it('returns to idle on reset', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(45_000);
    await fireEvent.press(screen.getByLabelText(`Reset ${A}`));

    expect(screen.getByText('READY')).toBeOnTheScreen();
    expect(screen.getByText('02:00')).toBeOnTheScreen();
  });

  it('locks the duration steppers while running', async () => {
    await renderScreen();
    await openSettings(A);

    expect(screen.getByLabelText('Increase Repeats')).toBeEnabled();
    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    expect(screen.getByLabelText('Increase Repeats')).toBeDisabled();
  });

  it('applies a config change and rebuilds the run', async () => {
    await renderScreen();
    await openSettings(A);

    await fireEvent.press(screen.getByLabelText('Increase Repeats'));

    expect(screen.getByText('Cycle 1 of 4')).toBeOnTheScreen();
    expect(screen.getByText('9m 30s total · 30s rest')).toBeOnTheScreen();
  });
});

describe('the alert cannot eat the rest', () => {
  /**
   * v0.4.0 got this wrong in a way these tests encoded rather than caught:
   * "no rest" was treated as an exception to the rule, when it is the worst
   * case of it — a ten-second buzz with no gap lands squarely inside the next
   * work phase.
   */
  it('will not step rest below the alert, and says why', async () => {
    await renderScreen();
    await openSettings(A);

    // A 10s buzz: rest can no longer go under ten seconds.
    await fireEvent.press(screen.getByLabelText('Increase Vibration')); // 5s
    await fireEvent.press(screen.getByLabelText('Increase Vibration')); // 10s

    await fireEvent.press(screen.getByLabelText('Decrease Rest')); // 30s -> 15s
    expect(screen.getByLabelText('Rest: 15s')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Decrease Rest')); // would be 0
    expect(screen.getByLabelText('Rest: 10s')).toBeOnTheScreen();
    expect(screen.getByLabelText('Decrease Rest')).toBeDisabled();
    expect(screen.getByText(/Rest is held at/)).toBeOnTheScreen();
  });

  it('allows no rest at all once nothing happens at a boundary', async () => {
    await renderScreen();
    await openSettings(A);

    // Vibration off and the voice silent: no noise to absorb, so work-to-work
    // with no gap is coherent again.
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    expect(screen.getByLabelText('Vibration: Off')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    expect(screen.getByLabelText('Sound: Silent')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Decrease Rest')); // 15s
    await fireEvent.press(screen.getByLabelText('Decrease Rest')); // None

    expect(screen.getByLabelText('Rest: None')).toBeOnTheScreen();
  });

  it('sends the ten-second file, which must actually be in the bundle', async () => {
    await renderScreen();
    await openSettings(A);

    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    await fireEvent.press(screen.getByLabelText('Increase Sound')); // Chime
    await fireEvent.press(screen.getByLabelText('Increase Ring length')); // 10s

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await act(async () => {});

    // See src/services/__tests__/bundledSounds.test.ts: a filename iOS cannot
    // resolve is delivered silently, which is how v0.4.0 shipped a long ring
    // that made no noise.
    expect(notifications.__pending('run').every((r) => r.content.sound === 'chime-10s.wav')).toBe(true);
  });
});

describe('several timers at once', () => {
  it('adds a timer with a name that cannot be confused with the first', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Add timer'));

    // The name is the title of every alert the run posts, so two timers sharing
    // one would make a banner ambiguous about which had finished.
    expect(screen.getByText(B)).toBeOnTheScreen();
    expect(screen.getByText('2 of 8 · 0 running')).toBeOnTheScreen();
  });

  it('runs two timers in parallel, each on its own timeline', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(30_000);
    // The second starts half a minute later and is therefore half a minute behind.
    await fireEvent.press(screen.getByLabelText(`Start ${B}`));
    await advance(30_000);

    expect(screen.getByText('01:00')).toBeOnTheScreen(); // the first, a minute in
    expect(screen.getByText('01:30')).toBeOnTheScreen(); // the second, 30s in
    expect(screen.getByText('2 of 8 · 2 running')).toBeOnTheScreen();
  });

  it('pausing one timer leaves the other running', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await fireEvent.press(screen.getByLabelText(`Start ${B}`));
    await advance(30_000);
    await fireEvent.press(screen.getByLabelText(`Pause ${A}`));
    await advance(30_000);

    expect(screen.getByLabelText(`Resume ${A}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Pause ${B}`)).toBeOnTheScreen();
    expect(screen.getByText('01:30')).toBeOnTheScreen(); // frozen at 30s in
    expect(screen.getByText('01:00')).toBeOnTheScreen(); // still going, a minute in
  });

  it('editing one timer does not disturb another that is running', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(30_000);

    await openSettings(B);
    await fireEvent.press(screen.getByLabelText('Increase Repeats'));

    expect(screen.getByText('Cycle 1 of 4')).toBeOnTheScreen(); // the edited one
    expect(screen.getByText('01:30')).toBeOnTheScreen(); // the running one, untouched
  });

  it('deletes a timer, and refuses to delete the last one', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    await openSettings(B);
    await fireEvent.press(screen.getByLabelText(`Delete ${B}`));
    expect(screen.queryByText(B)).not.toBeOnTheScreen();

    // An empty screen with no way back is worse than a timer you can edit.
    await openSettings(A);
    expect(screen.getByLabelText(`Delete ${A}`)).toBeDisabled();
  });

  it('keeps a labelled delete button, so swipe is never the only route', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    // The swipe-revealed button is hidden from assistive technology on purpose;
    // exactly one Delete per timer should be reachable by label.
    await openSettings(B);
    expect(screen.getByLabelText(`Delete ${B}`)).toBeOnTheScreen();
  });

  it('stops adding at the ceiling', async () => {
    await renderScreen();

    for (let i = 0; i < 7; i += 1) {
      await fireEvent.press(screen.getByLabelText('Add timer'));
    }

    expect(screen.getByText('8 of 8 · 0 running')).toBeOnTheScreen();
    expect(screen.getByLabelText('Add timer')).toBeDisabled();
  });

  it('buzzes with the length set on the timer whose phase ended', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    // Turn the second timer's vibration off; the first keeps its 3s default.
    await openSettings(B);
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));

    await fireEvent.press(screen.getByLabelText(`Start ${B}`));
    vibrate.mockClear();
    await advance(120_000);

    // Only the first timer would have buzzed, and it is not running.
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('the rest-end alert', () => {
  /**
   * The reported behaviour: a buzz when rest finished, which is wanted for sets and reps and
   * surprising otherwise. Now opt-in, and the two paths to that boundary — the in-app buzz and
   * the scheduled notification — are silenced together. Silencing one would leave the phone
   * buzzing whenever the app happened to be open.
   */
  it('does not buzz when a rest ends, by default', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(120_000); // work ends — this one still buzzes
    expect(vibrate).toHaveBeenCalled();

    vibrate.mockClear();
    await advance(30_000); // rest ends — this one should not
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('buzzes at the end of a rest once switched on', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderScreen();
    await openSettings(A);

    await fireEvent(screen.getByLabelText('Alert when rest ends'), 'valueChange', true);
    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(120_000);

    vibrate.mockClear();
    await advance(30_000);
    expect(vibrate).toHaveBeenCalled();
  });

  it('schedules no rest-end notification by default', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await act(async () => {});

    // Three of the five boundaries: two work-ends and the run-end.
    const pending = notifications.__pending('run');
    expect(pending).toHaveLength(3);
    expect(pending.every((r) => !String(r.content.body).startsWith('Back to work'))).toBe(true);
  });

  it('schedules all five once switched on', async () => {
    await renderScreen();
    await openSettings(A);

    await fireEvent(screen.getByLabelText('Alert when rest ends'), 'valueChange', true);
    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await act(async () => {});

    expect(notifications.__pending('run')).toHaveLength(5);
  });

  it('is not offered when there is no rest to end', async () => {
    await renderScreen();
    await openSettings(A);

    // Reaching None needs no alert at all: with a 3s buzz the rest floor holds rest at 3s.
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    await fireEvent.press(screen.getByLabelText('Increase Sound')); // Silent
    await fireEvent.press(screen.getByLabelText('Decrease Rest'));
    await fireEvent.press(screen.getByLabelText('Decrease Rest'));
    expect(screen.getByLabelText('Rest: None')).toBeOnTheScreen();

    expect(screen.queryByLabelText('Alert when rest ends')).not.toBeOnTheScreen();
  });
});

describe('notifications', () => {
  it('hands the run to the OS as local notifications when started', async () => {
    await renderScreen();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await act(async () => {});

    // Three boundaries, not five: the two rest-end alerts are opt-in and off by default.
    expect(notifications.__pending('run')).toHaveLength(3);
    expect(screen.queryByText(/Notifications are off/)).not.toBeOnTheScreen();
  });

  /**
   * The bug the run id in the notification key exists to prevent. iOS treats a
   * repeated identifier as a replace, so before the key was namespaced the
   * second timer's boundaries silently cancelled the first timer's.
   */
  it('keeps both timers alerts pending when two are running', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await act(async () => {});
    await fireEvent.press(screen.getByLabelText(`Start ${B}`));
    await act(async () => {});

    const pending = notifications.__pending('run');
    const titles = new Set(pending.map((request) => request.content.title));

    expect(pending).toHaveLength(6); // three apiece; rest-end is off by default
    expect(titles).toEqual(new Set([A, B]));
    expect(new Set(pending.map((request) => request.identifier)).size).toBe(6);
  });

  it('cancels a timers alerts when it is stopped, leaving the other timers alone', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await fireEvent.press(screen.getByLabelText(`Start ${B}`));
    await act(async () => {});
    await fireEvent.press(screen.getByLabelText(`Reset ${B}`));
    await act(async () => {});

    const pending = notifications.__pending('run');

    expect(pending).toHaveLength(3);
    expect(pending.every((request) => request.content.title === A)).toBe(true);
  });

  it('plays the voice chosen for that timer', async () => {
    await renderScreen();
    await openSettings(A);

    // Default -> Silent -> Chime.
    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    expect(screen.getByLabelText('Sound: Chime')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await act(async () => {});

    expect(notifications.__pending('run').every((request) => request.content.sound === 'chime.wav')).toBe(true);
  });

  it('explains the limitation when notifications are refused', async () => {
    const refused = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
    notifications.getPermissionsAsync.mockResolvedValue(refused);
    notifications.requestPermissionsAsync.mockResolvedValue(refused);

    await renderScreen();
    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await act(async () => {});

    expect(screen.getByText(/Notifications are off/)).toBeOnTheScreen();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('vibration', () => {
  it('buzzes for the configured length at a phase boundary', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
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
    await renderScreen();
    await openSettings(A);

    // Default is 3s: two steps down reaches Off.
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    expect(screen.getByLabelText('Vibration: Off')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    vibrate.mockClear();
    await advance(120_000);

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('lets vibration and sound be changed mid-run, unlike the durations', async () => {
    await renderScreen();
    await openSettings(A);

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));

    expect(screen.getByLabelText('Increase Vibration')).toBeEnabled();
    expect(screen.getByLabelText('Increase Sound')).toBeEnabled();
    await fireEvent.press(screen.getByLabelText('Increase Vibration'));
    expect(screen.getByLabelText('Vibration: 5s')).toBeOnTheScreen();
  });

  it('stops a buzz in progress when a control is pressed', async () => {
    const cancel = jest.spyOn(Vibration, 'cancel').mockImplementation(() => {});
    await renderScreen();

    await fireEvent.press(screen.getByLabelText(`Start ${A}`));

    expect(cancel).toHaveBeenCalled();
  });
});

describe('surviving the app being closed', () => {
  it('resumes a run that was left going', async () => {
    const first = await renderScreen();
    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await advance(45_000);
    expect(screen.getByText('01:15')).toBeOnTheScreen();
    await first.unmount();

    // Half a minute passes with the app closed — the run keeps going, because
    // elapsed time is derived from the clock rather than counted.
    jest.setSystemTime(new Date('2026-01-01T00:01:15Z'));
    await renderScreen();

    expect(screen.getByText('00:45')).toBeOnTheScreen();
    expect(screen.getByLabelText(`Pause ${A}`)).toBeOnTheScreen();
  });

  it('restores every timer, not just the first', async () => {
    const first = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add timer'));
    await fireEvent.press(screen.getByLabelText(`Start ${B}`));
    await advance(30_000);
    await first.unmount();

    await renderScreen();

    expect(screen.getByText('2 of 8 · 1 running')).toBeOnTheScreen();
    expect(screen.getByLabelText(`Pause ${B}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Start ${A}`)).toBeOnTheScreen();
  });

  it('does not replay alerts for boundaries passed while the app was closed', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    const first = await renderScreen();
    await fireEvent.press(screen.getByLabelText(`Start ${A}`));
    await first.unmount();

    // Reopened four minutes in: two boundaries have gone by. Their notifications
    // already fired; buzzing for them now would be a duplicate.
    jest.setSystemTime(new Date('2026-01-01T00:04:00Z'));
    vibrate.mockClear();
    await renderScreen();
    await advance(1_000);

    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.getByText('Cycle 2 of 3')).toBeOnTheScreen();
  });

  it('upgrades a single run stored by the previous version into the list', async () => {
    // v0.2 wrote one run under its own key. Anyone mid-run when they update
    // should come back to it rather than to a fresh default.
    await AsyncStorage.setItem(
      'gentle-task-timer/v1/timer-run',
      JSON.stringify({
        config: { name: 'Bread', workDurationMs: 600_000, restDurationMs: 0, repeats: 1, vibrationMs: 3_000 },
        status: 'running',
        accumulatedMs: 0,
        lastResumedAt: Date.now(),
      }),
    );

    await renderScreen();

    expect(screen.getByText('Bread')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pause Bread')).toBeOnTheScreen();
    expect(screen.getByText('1 of 8 · 1 running')).toBeOnTheScreen();
  });
});
