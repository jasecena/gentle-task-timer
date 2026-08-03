import { fireEvent, render, screen } from '@testing-library/react-native';

import { DEFAULT_REMINDER_CONFIG, validateReminderConfig, type ReminderConfig } from '@/core/reminders';

import { RemindersScreen } from './RemindersScreen';
import type { UseReminders } from './hooks/useReminders';

/**
 * The screen takes its state as a prop, so these tests need no storage, no
 * notification module and no async settling — they check what the screen shows
 * and which callback a press reaches.
 */
function reminders(config: Partial<ReminderConfig> = {}, overrides: Partial<UseReminders> = {}): UseReminders {
  const merged = { ...DEFAULT_REMINDER_CONFIG, ...config };
  const issues = validateReminderConfig(merged);
  return {
    config: merged,
    setConfig: jest.fn(),
    issues,
    slotCount: countOf(merged),
    ready: true,
    permission: 'unknown',
    start: jest.fn(),
    stop: jest.fn(),
    ...overrides,
  };
}

function countOf(config: ReminderConfig): number {
  const perDay = Math.floor((config.endMinute - config.startMinute) / Math.round(config.intervalMs / 60_000)) + 1;
  return Math.max(0, perDay) * config.days.length;
}

describe('RemindersScreen', () => {
  it('shows what the schedule will cost against the budget', async () => {
    // Hourly, 09:00–17:00, Mon–Fri: 9 a day across 5 days.
    await render(<RemindersScreen reminders={reminders({ intervalMs: 60 * 60_000 })} />);

    expect(screen.getByText('45 of 48 alerts a week')).toBeOnTheScreen();
    expect(screen.getByText('9 a day × 5 days')).toBeOnTheScreen();
  });

  it('blocks arming an over-budget schedule and says what to do about it', async () => {
    const state = reminders(); // the default: every 30 min, 9–5, weekdays = 85
    await render(<RemindersScreen reminders={state} />);

    expect(screen.getByText(/85 alerts a week/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Start schedule')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Start schedule'));
    expect(state.start).not.toHaveBeenCalled();
  });

  it('arms a schedule that fits', async () => {
    const state = reminders({ intervalMs: 60 * 60_000 });
    await render(<RemindersScreen reminders={state} />);

    expect(screen.getByLabelText('Start schedule')).toBeEnabled();
    await fireEvent.press(screen.getByLabelText('Start schedule'));

    expect(state.start).toHaveBeenCalled();
  });

  it('offers a stop button once armed, and nothing else', async () => {
    const state = reminders({ intervalMs: 60 * 60_000, enabled: true });
    await render(<RemindersScreen reminders={state} />);

    expect(screen.queryByLabelText('Start schedule')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Stop schedule'));

    expect(state.stop).toHaveBeenCalled();
  });

  it('summarises an armed schedule in words', async () => {
    await render(<RemindersScreen reminders={reminders({ intervalMs: 60 * 60_000, enabled: true })} />);

    expect(screen.getByText('Armed · Mon–Fri · 09:00–17:00')).toBeOnTheScreen();
  });

  it('locks the editor while armed, so a live schedule cannot drift from its alerts', async () => {
    await render(<RemindersScreen reminders={reminders({ intervalMs: 60 * 60_000, enabled: true })} />);

    expect(screen.getByLabelText('Increase Every')).toBeDisabled();
    expect(screen.getByLabelText('Monday')).toBeDisabled();
  });

  it('reports a day with no alerts rather than pretending it is armed', async () => {
    const state = reminders({ intervalMs: 60 * 60_000, days: [] });
    await render(<RemindersScreen reminders={state} />);

    expect(screen.getByText('Pick at least one day.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Start schedule')).toBeDisabled();
  });

  it('says alerts cannot arrive when notifications are refused', async () => {
    await render(<RemindersScreen reminders={reminders({ intervalMs: 60 * 60_000 }, { permission: 'denied' })} />);

    expect(screen.getByText(/Notifications are off/)).toBeOnTheScreen();
  });

  it('toggles a day through the editor', async () => {
    const state = reminders({ intervalMs: 60 * 60_000 });
    await render(<RemindersScreen reminders={state} />);

    await fireEvent.press(screen.getByLabelText('Sunday'));

    expect(state.setConfig).toHaveBeenCalledWith(expect.objectContaining({ days: [0, 1, 2, 3, 4, 5] }));
  });

  it('steps the vibration setting, including all the way off', async () => {
    const state = reminders({ intervalMs: 60 * 60_000, vibrationMs: 1_000 });
    await render(<RemindersScreen reminders={state} />);

    await fireEvent.press(screen.getByLabelText('Decrease Vibration'));

    expect(state.setConfig).toHaveBeenCalledWith(expect.objectContaining({ vibrationMs: 0 }));
  });
});
