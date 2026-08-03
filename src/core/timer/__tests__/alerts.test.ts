import { MAX_PENDING_ALERTS, planAlerts } from '../alerts';
import { buildSchedule } from '../schedule';
import type { TimerConfig } from '../types';

const RUN_START = 1_800_000_000_000;

const POMODORO: TimerConfig = {
  name: 'Timer',
  workDurationMs: 120_000,
  restDurationMs: 30_000,
  repeats: 3,
  vibrationMs: 3_000,
};

function plan(config: TimerConfig, elapsedMs = 0, limit?: number) {
  return planAlerts({ schedule: buildSchedule(config), runStartedAtMs: RUN_START, elapsedMs, limit });
}

describe('planAlerts', () => {
  it('places one alert at the end of every phase, in fire order', () => {
    const alerts = plan(POMODORO);

    expect(alerts.map((alert) => alert.fireAtMs - RUN_START)).toEqual([
      120_000, // work 1
      150_000, // rest 1
      270_000, // work 2
      300_000, // rest 2
      420_000, // work 3 — the run ends here, with no trailing rest
    ]);
  });

  it('announces what starts next rather than what just finished', () => {
    const alerts = plan(POMODORO);

    expect(alerts.map((alert) => alert.kind)).toEqual([
      'rest-start',
      'work-start',
      'rest-start',
      'work-start',
      'run-end',
    ]);
    expect(alerts[0]).toMatchObject({ title: 'Time to rest', body: 'Cycle 1 of 3 done · 30s rest' });
    expect(alerts[1]).toMatchObject({ title: 'Back to work', body: 'Cycle 2 of 3 · 2m' });
    expect(alerts[4]).toMatchObject({ title: 'All done', body: '3 cycles · 7m total' });
  });

  it('goes straight from work to work when rest is disabled', () => {
    const alerts = plan({ ...POMODORO, restDurationMs: 0 });

    expect(alerts.map((alert) => alert.kind)).toEqual(['work-start', 'work-start', 'run-end']);
    expect(alerts[0]).toMatchObject({ title: 'Back to work', body: 'Cycle 2 of 3 · 2m' });
  });

  it('produces a single run-end alert for a one-cycle run', () => {
    const alerts = plan({ ...POMODORO, repeats: 1 });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'run-end', body: '1 cycle · 2m total' });
  });

  it('skips boundaries that have already passed', () => {
    // Mid-way through the second work phase: the first two boundaries are gone.
    const alerts = plan(POMODORO, 200_000);

    expect(alerts.map((alert) => alert.phaseIndex)).toEqual([2, 3, 4]);
    expect(alerts[0]!.fireAtMs).toBe(RUN_START + 270_000);
  });

  it('treats a boundary exactly at the current elapsed time as already announced', () => {
    // The in-app window (from, to] has just fired this one; scheduling it too
    // would deliver a duplicate the instant it is handed to the OS.
    const alerts = plan(POMODORO, 120_000);

    expect(alerts.map((alert) => alert.phaseIndex)).toEqual([1, 2, 3, 4]);
  });

  it('returns nothing once the run is over', () => {
    expect(plan(POMODORO, 420_000)).toEqual([]);
  });

  it('caps a long run at the pending-notification limit', () => {
    const alerts = plan({ ...POMODORO, repeats: 999 });

    expect(alerts).toHaveLength(MAX_PENDING_ALERTS);
    // Capped from the front: the next boundaries are the ones worth having.
    expect(alerts[0]!.phaseIndex).toBe(0);
  });

  it('refills the window as the run progresses', () => {
    const config = { ...POMODORO, repeats: 999 };
    const first = plan(config, 0);
    const later = plan(config, first[first.length - 1]!.fireAtMs - RUN_START);

    expect(later).toHaveLength(MAX_PENDING_ALERTS);
    expect(later[0]!.phaseIndex).toBe(first[first.length - 1]!.phaseIndex + 1);
  });

  it('keys alerts stably, so a re-plan replaces rather than duplicates', () => {
    const keys = plan(POMODORO, 0).map((alert) => alert.key);
    const keysAfterPause = plan(POMODORO, 60_000).map((alert) => alert.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keysAfterPause).toEqual(keys);
  });

  it('honours an explicit limit', () => {
    expect(plan(POMODORO, 0, 2)).toHaveLength(2);
    expect(plan(POMODORO, 0, 0)).toEqual([]);
  });

  it('refuses to plan without a usable run start', () => {
    expect(planAlerts({ schedule: buildSchedule(POMODORO), runStartedAtMs: Number.NaN, elapsedMs: 0 })).toEqual([]);
  });
});
