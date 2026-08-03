import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DateTimePicker from '@react-native-community/datetimepicker';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Audio from 'expo-audio';
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
  (Audio as unknown as { __reset: () => void }).__reset();
  (DateTimePicker as unknown as { __reset: () => void }).__reset();
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

function setTime(label: string, hours: number, minutes: number) {
  (DateTimePicker as unknown as { __setTime: (l: string, h: number, m: number) => void }).__setTime(
    label,
    hours,
    minutes,
  );
}

function timeOf(label: string): string | undefined {
  return (DateTimePicker as unknown as { __timeOf: (l: string) => string | undefined }).__timeOf(label);
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
    await act(async () => {
      setTime('At', 7, 40);
    });
    await addNote('Bins out');

    expect(screen.getByText('Friday 07:40 · in 22h 40m')).toBeOnTheScreen();
    expect(notifications.__pending('oneoff')[0]!.trigger).toMatchObject({ weekday: 6, hour: 7, minute: 40 });
  });

  it('shows the chosen time on the picker itself', async () => {
    await renderScreen();

    expect(timeOf('At')).toBe('09:00');
    await act(async () => {
      setTime('At', 18, 5);
    });

    expect(timeOf('At')).toBe('18:05');
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

    // Default -> Silent -> Chime.
    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    expect(screen.getByLabelText('Sound: Chime')).toBeOnTheScreen();
    await addNote('Call the dentist');

    expect(notifications.__pending('oneoff')[0]!.content.sound).toBe('chime.wav');
  });

  /**
   * The voices are deliberately similar enough that their names do not settle
   * the choice, so picking one you cannot hear is guesswork.
   */
  it('previews a voice as you step onto it', async () => {
    await renderScreen();
    const audio = Audio as unknown as { __players: () => { clip: unknown }[]; __playCount: () => number };

    await fireEvent.press(screen.getByLabelText('Increase Sound')); // Silent — nothing to play
    expect(audio.__playCount()).toBe(0);

    await fireEvent.press(screen.getByLabelText('Increase Sound')); // Chime
    expect(audio.__playCount()).toBe(1);

    // Tapping the value replays it, so two voices can be compared without
    // stepping past and back.
    await fireEvent.press(screen.getByLabelText('Sound: Chime'));
    expect(audio.__playCount()).toBe(2);
  });

  it('sends a silent note with no sound key at all', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    expect(screen.getByLabelText('Sound: Silent')).toBeOnTheScreen();
    // Asserted while it is still the draft: adding clears the composer, and
    // with it the caveat this note is about.
    expect(screen.getByText(/Silent alerts make no sound/)).toBeOnTheScreen();

    await addNote('Quietly');

    // Not 'default', and not a filename — absent. iOS plays nothing.
    expect(notifications.__pending('oneoff')[0]!.content.sound).toBeUndefined();
  });

  it('sends the ten-second file when the ring is set long', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Increase Sound'));
    await fireEvent.press(screen.getByLabelText('Increase Sound')); // Chime
    await fireEvent.press(screen.getByLabelText('Increase Ring length'));
    expect(screen.getByLabelText('Ring length: 10s')).toBeOnTheScreen();
    await addNote('Long one');

    expect(notifications.__pending('oneoff')[0]!.content.sound).toBe('chime-10s.wav');
  });

  it('offers no ring length for a voice that has only one', async () => {
    await renderScreen();

    // Default is the system sound: one length, so the row is visibly dead
    // rather than missing.
    expect(screen.getByLabelText('Ring length: —')).toBeOnTheScreen();
    expect(screen.getByLabelText('Increase Ring length')).toBeDisabled();
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
