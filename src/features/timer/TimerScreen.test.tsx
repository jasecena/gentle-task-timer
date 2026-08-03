import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { TimerScreen } from './TimerScreen';

// The screen is driven by Date.now(); fake timers let a test walk a three-cycle
// run in milliseconds instead of six and a half minutes.
beforeEach(() => {
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

  it('applies a config change and rebuilds the run', async () => {
    await render(<TimerScreen />);

    await fireEvent.press(screen.getByLabelText('Increase Repeats'));

    expect(screen.getByText('Cycle 1 of 4')).toBeOnTheScreen();
    expect(screen.getByText('9m 30s total · 30s rest')).toBeOnTheScreen();
  });
});
