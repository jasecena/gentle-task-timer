import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { ONEOFF_LIMITS } from '@/core/oneoffs';

import { OneOffsScreen } from './OneOffsScreen';
import { useOneOffs } from './hooks/useOneOffs';

/** The mock's own granted fixture, reinstated before each test. */
const GRANTED = (Notifications as unknown as { granted: unknown }).granted;

const notifications = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  __pending: (
    tag?: string,
  ) => { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> }[];
  __reset: () => void;
};

beforeEach(async () => {
  jest.clearAllMocks();
  notifications.__reset();
  // `clearAllMocks` clears call history but not implementations, so a test that
  // stubs permission as denied would otherwise leave it denied for every test
  // after it. Granted is the default; the denial tests opt out for themselves.
  notifications.getPermissionsAsync.mockResolvedValue(GRANTED);
  notifications.requestPermissionsAsync.mockResolvedValue(GRANTED);
  await AsyncStorage.clear();
  jest.useFakeTimers();
  // A Thursday, so "next Monday" and "later today" are both reachable.
  jest.setSystemTime(new Date('2026-01-01T09:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

/** Hosts the hook, the way the shell does, so the screen stays a pure view. */
function Host() {
  return <OneOffsScreen oneoffs={useOneOffs()} />;
}

async function renderScreen() {
  const rendered = await render(<Host />);
  // Twice: the restore effect awaits storage and then asks iOS what it is still
  // holding, so a single flush only gets through the first of the two.
  await act(async () => {});
  await act(async () => {});
  return rendered;
}

async function addNote(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Note'), text);
  await fireEvent.press(screen.getByLabelText('Add note'));
  await act(async () => {});
}

describe('OneOffsScreen', () => {
  it('starts empty and explains what a note does', async () => {
    await renderScreen();

    expect(screen.getByText(`0 of ${ONEOFF_LIMITS.MAX_ONEOFFS} notes waiting`)).toBeOnTheScreen();
    expect(screen.getByText(/Nothing waiting/)).toBeOnTheScreen();
  });

  it('will not add a note with no text', async () => {
    await renderScreen();

    // A notification with no text is a buzz you cannot interpret.
    expect(screen.getByLabelText('Add note')).toBeDisabled();
  });

  it('adds a note and lists it with its day, time and lead', async () => {
    await renderScreen();
    await addNote('Call the dentist');

    expect(screen.getByText('Call the dentist')).toBeOnTheScreen();
    // Default is Monday 09:00; from Thursday morning that is four days off.
    expect(screen.getByText('Monday 09:00 · in 4 days')).toBeOnTheScreen();
    expect(screen.getByText(`1 of ${ONEOFF_LIMITS.MAX_ONEOFFS} notes waiting`)).toBeOnTheScreen();
  });

  it('clears the composer once a note is added', async () => {
    await renderScreen();
    await addNote('Call the dentist');

    expect(screen.getByLabelText('Add note')).toBeDisabled();
    expect(screen.getByLabelText('Note').props.value).toBe('');
  });

  /**
   * The trigger type is the whole design: a non-repeating calendar trigger lets
   * iOS resolve the next matching moment in local time, so nothing here stores
   * an instant that could be an hour wrong after the clocks change.
   */
  it('hands iOS a non-repeating calendar trigger, not a date or a weekly one', async () => {
    await renderScreen();
    await addNote('Call the dentist');

    const [request] = notifications.__pending('oneoff');

    expect(request!.trigger).toMatchObject({ type: 'calendar', weekday: 2, hour: 9, minute: 0, repeats: false });
  });

  it('puts the note in the title, where a banner shows it first', async () => {
    await renderScreen();
    await addNote('Call the dentist');

    const [request] = notifications.__pending('oneoff');

    expect(request!.content).toMatchObject({ title: 'Call the dentist', body: 'Monday 09:00' });
  });

  it('takes the day and time from the pickers', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Friday'));
    await fireEvent.press(screen.getByLabelText('Increase At')); // 09:00 -> 09:15
    await addNote('Bins out');

    expect(screen.getByText('Friday 09:15 · in 1 day')).toBeOnTheScreen();
    expect(notifications.__pending('oneoff')[0]!.trigger).toMatchObject({ weekday: 6, hour: 9, minute: 15 });
  });

  it('picks one day at a time, because a one-off happens once', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Friday'));
    await fireEvent.press(screen.getByLabelText('Sunday'));
    await addNote('Bins out');

    expect(screen.getByText(/^Sunday/)).toBeOnTheScreen();
    expect(notifications.__pending('oneoff')).toHaveLength(1);
  });

  it('plays the voice chosen for the note', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    expect(screen.getByLabelText('Sound: Chime')).toBeOnTheScreen();
    await addNote('Call the dentist');

    expect(notifications.__pending('oneoff')[0]!.content.sound).toBe('chime.wav');
  });

  it('deletes one note without touching the others', async () => {
    await renderScreen();
    await addNote('First');
    await addNote('Second');

    await fireEvent.press(screen.getByLabelText('Delete note: First'));
    await act(async () => {});

    expect(screen.queryByText('First')).not.toBeOnTheScreen();
    expect(screen.getByText('Second')).toBeOnTheScreen();
    expect(notifications.__pending('oneoff')).toHaveLength(1);
  });

  it('refuses to go past the budget, naming the number', async () => {
    await renderScreen();
    for (let i = 0; i < ONEOFF_LIMITS.MAX_ONEOFFS; i += 1) {
      await addNote(`Note ${i}`);
    }

    await fireEvent.changeText(screen.getByLabelText('Note'), 'One too many');

    expect(screen.getByText(new RegExp(`${ONEOFF_LIMITS.MAX_ONEOFFS} notes is the limit`))).toBeOnTheScreen();
    expect(screen.getByLabelText('Add note')).toBeDisabled();
  });

  it('explains the limitation when notifications are refused', async () => {
    const refused = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
    notifications.getPermissionsAsync.mockResolvedValue(refused);
    notifications.requestPermissionsAsync.mockResolvedValue(refused);

    await renderScreen();
    await addNote('Call the dentist');

    expect(screen.getByText(/Notifications are off/)).toBeOnTheScreen();
    expect(notifications.__pending('oneoff')).toHaveLength(0);
  });
});

describe('surviving the app being closed', () => {
  it('brings back the notes iOS is still holding', async () => {
    const first = await renderScreen();
    await addNote('Call the dentist');
    await first.unmount();

    await renderScreen();

    expect(screen.getByText('Call the dentist')).toBeOnTheScreen();
  });

  /**
   * How a fired note removes itself. A non-repeating notification leaves the
   * pending list the instant iOS delivers it, so "not pending" means "it
   * happened" — no clock comparison, and it works for a note that fired while
   * the app was closed for a week.
   */
  it('forgets a note that has already fired', async () => {
    const first = await renderScreen();
    await addNote('Already happened');
    await addNote('Still to come');
    await first.unmount();

    // iOS delivered the first one while the app was closed.
    await Notifications.cancelScheduledNotificationAsync('oneoff-o1');

    await renderScreen();

    expect(screen.queryByText('Already happened')).not.toBeOnTheScreen();
    expect(screen.getByText('Still to come')).toBeOnTheScreen();
    expect(screen.getByText(`1 of ${ONEOFF_LIMITS.MAX_ONEOFFS} notes waiting`)).toBeOnTheScreen();
  });
});
