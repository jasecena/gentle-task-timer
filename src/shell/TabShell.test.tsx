import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { TabShell } from './TabShell';

const notifications = Notifications as unknown as { __reset: () => void };

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
  it('opens on the timer', async () => {
    await renderShell();

    expect(screen.getByText('READY')).toBeOnTheScreen();
    expect(screen.getByLabelText('Timer tab')).toBeOnTheScreen();
    expect(screen.getByLabelText('Schedule tab')).toBeOnTheScreen();
  });

  it('switches to the schedule tab', async () => {
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Schedule tab'));

    expect(screen.getByLabelText('Start schedule')).toBeOnTheScreen();
  });

  it('keeps a running timer going while the schedule tab is open', async () => {
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Start'));
    await fireEvent.press(screen.getByLabelText('Schedule tab'));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await fireEvent.press(screen.getByLabelText('Timer tab'));

    // Both screens stay mounted, so the run was never interrupted — half a
    // minute of a two-minute phase has gone.
    expect(screen.getByText('01:30')).toBeOnTheScreen();
  });
});
