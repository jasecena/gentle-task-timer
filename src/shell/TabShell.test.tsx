import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';

import { TabShell } from './TabShell';

const notifications = Notifications as unknown as {
  __reset: () => void;
  __pending: (tag?: string) => { identifier: string; content: Record<string, unknown> }[];
  __deliver: (identifier: string) => void;
};

const TIMER = 'Gentle Task Timer';

beforeEach(async () => {
  jest.clearAllMocks();
  notifications.__reset();
  await AsyncStorage.clear();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderShell() {
  const rendered = await render(<TabShell />);
  await act(async () => {});
  return rendered;
}

describe('TabShell', () => {
  it('opens on the timers, with all three modes reachable', async () => {
    await renderShell();

    expect(screen.getByText('READY')).toBeOnTheScreen();
    expect(screen.getByLabelText('Timers tab')).toBeOnTheScreen();
    expect(screen.getByLabelText('Once tab')).toBeOnTheScreen();
    expect(screen.getByLabelText('Schedule tab')).toBeOnTheScreen();
  });

  it('switches to the schedule tab', async () => {
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Schedule tab'));

    expect(screen.getByLabelText('Start schedule')).toBeOnTheScreen();
  });

  it('switches to the one-off tab', async () => {
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Once tab'));

    expect(screen.getByLabelText('Add note')).toBeOnTheScreen();
    expect(screen.getByLabelText('Note')).toBeOnTheScreen();
  });

  it('keeps a running timer going while another tab is open', async () => {
    await renderShell();

    await fireEvent.press(screen.getByLabelText(`Start ${TIMER}`));
    await fireEvent.press(screen.getByLabelText('Schedule tab'));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await fireEvent.press(screen.getByLabelText('Timers tab'));

    // Every screen stays mounted, so the run was never interrupted — half a
    // minute of a two-minute phase has gone.
    expect(screen.getByText('01:30')).toBeOnTheScreen();
  });

  /**
   * The reason the shell knows anything at all. iOS holds 64 pending alerts
   * app-wide, and all three features want slots; cancellation is tag-scoped so
   * that none of them can wipe another's.
   */
  it('lets a note and a run hold their alerts at the same time', async () => {
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Once tab'));
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Call the dentist');
    await fireEvent.press(screen.getByLabelText('Add note'));
    await act(async () => {});

    await fireEvent.press(screen.getByLabelText('Timers tab'));
    await fireEvent.press(screen.getByLabelText(`Start ${TIMER}`));
    await act(async () => {});

    // Three run boundaries (rest-end is opt-in) plus the one note, all still pending.
    expect(notifications.__pending('run')).toHaveLength(3);
    expect(notifications.__pending('oneoff')).toHaveLength(1);
  });
});

describe('vibration when an alert arrives', () => {
  /**
   * The bug these exist for: `Vibration.vibrate` was called in exactly one file — the timer
   * screen — so the vibration setting on the Schedule and Once tabs was stored, displayed,
   * and never read. The ring worked because it rides on the notification and iOS plays it;
   * the buzz needs JavaScript to drive a train of pulses, and nothing was listening.
   *
   * Foreground only, which is all the setting ever claimed: with the app closed there is no
   * JavaScript to run a train and iOS gives its own single buzz.
   */
  it('buzzes for a one-off note, for the length that was chosen', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Once tab'));
    await fireEvent.press(screen.getByLabelText('Increase Vibration')); // 3s -> 5s
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Call the dentist');
    await fireEvent.press(screen.getByLabelText('Add note'));
    await act(async () => {});

    vibrate.mockClear();
    await act(async () => {
      notifications.__deliver(notifications.__pending('oneoff')[0]!.identifier);
    });

    const [pattern] = vibrate.mock.calls[0]!;
    // A train, not a single pulse: iOS only does fixed-length buzzes, so a 5s vibration is
    // several of them spaced to fill five seconds.
    expect(Array.isArray(pattern)).toBe(true);
    expect((pattern as number[]).length).toBeGreaterThan(1);
  });

  it('buzzes for a schedule alert too', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Schedule tab'));
    // The default schedule is over budget, so narrow it until it can be armed.
    await fireEvent.press(screen.getByLabelText('Increase Every'));
    await fireEvent.press(screen.getByLabelText('Increase Every'));
    await fireEvent.press(screen.getByLabelText('Start schedule'));
    await act(async () => {});

    const pending = notifications.__pending('reminder');
    expect(pending.length).toBeGreaterThan(0);

    vibrate.mockClear();
    await act(async () => {
      notifications.__deliver(pending[0]!.identifier);
    });

    expect(vibrate).toHaveBeenCalled();
  });

  it('does not buzz when the note is set to no vibration', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Once tab'));
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));
    expect(screen.getByLabelText('Vibration: Off')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Note'), 'Quietly');
    await fireEvent.press(screen.getByLabelText('Add note'));
    await act(async () => {});

    vibrate.mockClear();
    await act(async () => {
      notifications.__deliver(notifications.__pending('oneoff')[0]!.identifier);
    });

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does not double-buzz a timer boundary', async () => {
    // A run already vibrates from the engine, off elapsed-time windows — a path that works
    // even when the notification is suppressed. Buzzing here as well would buzz twice.
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    await renderShell();

    await fireEvent.press(screen.getByLabelText(`Start ${TIMER}`));
    await act(async () => {});

    vibrate.mockClear();
    await act(async () => {
      notifications.__deliver(notifications.__pending('run')[0]!.identifier);
    });

    expect(vibrate).not.toHaveBeenCalled();
  });
});
