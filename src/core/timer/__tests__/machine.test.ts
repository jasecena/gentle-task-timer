import { buildSchedule } from '../schedule';
import { createTimer, elapsedMsAt, isComplete, pause, project, reset, resume, settle, start, toggle } from '../machine';
import type { TimerConfig } from '../types';

const T0 = 1_700_000_000_000; // fixed epoch; nothing here reads the real clock

const config = (overrides: Partial<TimerConfig> = {}): TimerConfig => ({
  name: 'Test',
  workDurationMs: 120_000,
  restDurationMs: 30_000,
  repeats: 3,
  vibrationMs: 3_000,
  soundId: 'default',
  ringMs: 1_500,
  ...overrides,
});

describe('transitions', () => {
  it('starts idle with no progress', () => {
    const state = createTimer(config());

    expect(state.status).toBe('idle');
    expect(state.accumulatedMs).toBe(0);
    expect(state.lastResumedAt).toBeNull();
  });

  it('accumulates elapsed time across a pause and resume', () => {
    let state = start(createTimer(config()), T0);
    state = pause(state, T0 + 10_000);

    expect(state.status).toBe('paused');
    expect(state.accumulatedMs).toBe(10_000);

    // Five minutes pass while paused; they must not count.
    state = resume(state, T0 + 310_000);
    expect(elapsedMsAt(state, T0 + 310_000)).toBe(10_000);
    expect(elapsedMsAt(state, T0 + 315_000)).toBe(15_000);
  });

  it('ignores pause when not running and resume when not paused', () => {
    const idle = createTimer(config());
    expect(pause(idle, T0)).toBe(idle);
    expect(resume(idle, T0)).toBe(idle);

    const running = start(idle, T0);
    expect(resume(running, T0 + 1_000)).toBe(running);
  });

  it('discards progress on reset and on a fresh start', () => {
    const running = start(createTimer(config()), T0);

    expect(reset(running)).toMatchObject({ status: 'idle', accumulatedMs: 0, lastResumedAt: null });
    expect(start(pause(running, T0 + 90_000), T0 + 95_000)).toMatchObject({ status: 'running', accumulatedMs: 0 });
  });

  it('cycles start -> pause -> resume through toggle, and restarts once complete', () => {
    let state = createTimer(config({ repeats: 1, restDurationMs: 0 }));

    state = toggle(state, T0);
    expect(state.status).toBe('running');

    state = toggle(state, T0 + 5_000);
    expect(state.status).toBe('paused');

    state = toggle(state, T0 + 6_000);
    expect(state.status).toBe('running');

    state = settle(state, T0 + 200_000);
    expect(state.status).toBe('completed');

    state = toggle(state, T0 + 210_000);
    expect(state).toMatchObject({ status: 'running', accumulatedMs: 0 });
  });
});

describe('clock robustness', () => {
  it('does not rewind when the wall clock jumps backwards', () => {
    // An NTP correction or a manual clock change can move `now` backwards.
    const state = start(createTimer(config()), T0);

    expect(elapsedMsAt(state, T0 + 30_000)).toBe(30_000);
    expect(elapsedMsAt(state, T0 - 60_000)).toBe(0);
  });

  it('clamps elapsed time to the run duration', () => {
    const schedule = buildSchedule(config());
    const state = start(createTimer(config()), T0);

    expect(elapsedMsAt(state, T0 + 10 * schedule.totalDurationMs)).toBe(schedule.totalDurationMs);
  });

  it('reconstructs exact position after a long suspension', () => {
    // The app is backgrounded at start and only wakes 5 minutes later. Because
    // elapsed time is derived from timestamps rather than counted in ticks,
    // the timer lands mid-cycle-3 with no drift.
    const state = start(createTimer(config()), T0);
    const view = project(state, T0 + 300_000);

    expect(view.phase).toMatchObject({ kind: 'work', cycle: 3 });
    expect(view.phaseElapsedMs).toBe(0);
    expect(view.completedCycles).toBe(2);
  });
});

describe('completion', () => {
  const schedule = buildSchedule(config());

  it('reports completion once the total duration is reached', () => {
    const state = start(createTimer(config()), T0);

    expect(isComplete(state, T0 + schedule.totalDurationMs - 1)).toBe(false);
    expect(isComplete(state, T0 + schedule.totalDurationMs)).toBe(true);
  });

  it('settle freezes the state so it no longer depends on the clock', () => {
    const state = start(createTimer(config()), T0);
    const settled = settle(state, T0 + schedule.totalDurationMs);

    expect(settled).toMatchObject({
      status: 'completed',
      accumulatedMs: schedule.totalDurationMs,
      lastResumedAt: null,
    });
    // Stays put no matter how much later it is read.
    expect(elapsedMsAt(settled, T0 + 99_999_999)).toBe(schedule.totalDurationMs);
  });

  it('settle is a no-op before the run finishes', () => {
    const state = start(createTimer(config()), T0);
    expect(settle(state, T0 + 1_000)).toBe(state);
  });

  it('projects as completed even before settle is called', () => {
    const state = start(createTimer(config()), T0);
    const view = project(state, T0 + schedule.totalDurationMs + 5_000);

    expect(view.status).toBe('completed');
    expect(view.phase).toBeNull();
    expect(view.totalRemainingMs).toBe(0);
    expect(view.completedCycles).toBe(3);
    expect(view.progress).toBe(1);
  });
});

describe('project', () => {
  it('shows the full duration and no progress while idle', () => {
    const view = project(createTimer(config()), T0);

    expect(view).toMatchObject({
      status: 'idle',
      elapsedMs: 0,
      progress: 0,
      phase: null,
      currentCycle: 1,
      totalCycles: 3,
    });
    expect(view.totalRemainingMs).toBe(buildSchedule(config()).totalDurationMs);
  });

  it('reports remaining time within the current phase', () => {
    const state = start(createTimer(config()), T0);
    const view = project(state, T0 + 90_000);

    expect(view.phase).toMatchObject({ kind: 'work', cycle: 1 });
    expect(view.phaseRemainingMs).toBe(30_000);
    expect(view.phaseElapsedMs).toBe(90_000);
    expect(view.currentCycle).toBe(1);
  });

  it('reports the rest phase between cycles', () => {
    const state = start(createTimer(config()), T0);
    const view = project(state, T0 + 130_000);

    expect(view.phase).toMatchObject({ kind: 'rest', cycle: 1 });
    expect(view.phaseRemainingMs).toBe(20_000);
    expect(view.completedCycles).toBe(1);
  });

  it('holds position while paused', () => {
    const state = pause(start(createTimer(config()), T0), T0 + 45_000);

    expect(project(state, T0 + 45_000).phaseRemainingMs).toBe(75_000);
    expect(project(state, T0 + 600_000).phaseRemainingMs).toBe(75_000);
    expect(project(state, T0 + 600_000).status).toBe('paused');
  });

  it('never reports a negative or out-of-range value at any point in a run', () => {
    const schedule = buildSchedule(config());
    const state = start(createTimer(config()), T0);

    for (let t = 0; t <= schedule.totalDurationMs + 10_000; t += 500) {
      const view = project(state, T0 + t);
      expect(view.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(view.elapsedMs).toBeLessThanOrEqual(schedule.totalDurationMs);
      expect(view.totalRemainingMs).toBeGreaterThanOrEqual(0);
      expect(view.phaseRemainingMs).toBeGreaterThanOrEqual(0);
      expect(view.progress).toBeGreaterThanOrEqual(0);
      expect(view.progress).toBeLessThanOrEqual(1);
      expect(view.completedCycles).toBeLessThanOrEqual(view.totalCycles);
    }
  });
});
