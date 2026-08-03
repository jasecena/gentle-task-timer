import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { TabShell } from './TabShell';

const notifications = Notifications as unknown as {
  __reset: () => void;
  __pending: (tag?: string) => unknown[];
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

    // Five run boundaries plus the one note, all still pending.
    expect(notifications.__pending('run')).toHaveLength(5);
    expect(notifications.__pending('oneoff')).toHaveLength(1);
  });
});
