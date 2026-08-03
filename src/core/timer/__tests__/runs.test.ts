import { DEFAULT_CONFIG } from '../config';
import { pause, start } from '../machine';
import {
  addRun,
  createRun,
  findRun,
  MAX_RUNS,
  nextRunId,
  normalizeRuns,
  planRunAlerts,
  removeRun,
  runningRuns,
  updateRun,
  type TimerRun,
} from '../runs';
import type { TimerConfig } from '../types';

const T0 = 1_800_000_000_000;

const config = (overrides: Partial<TimerConfig> = {}): TimerConfig => ({ ...DEFAULT_CONFIG, ...overrides });

/**
 * A run that has been going since T0, so it has real boundaries ahead of it.
 *
 * Alerts are off by default here: a buzz or a ring imposes a minimum rest (see
 * `restFloorMs`), and these tests are about *when* boundaries land, not about
 * what happens at them. Leaving the default 3s vibration on would quietly give
 * every "no rest" fixture a 3s rest and shift every expected time.
 */
function running(id: string, overrides: Partial<TimerConfig> = {}): TimerRun {
  return { id, state: start(createRun(id, config({ vibrationMs: 0, soundId: 'silent', ...overrides })).state, T0) };
}

describe('nextRunId', () => {
  it('never reuses an id, even after the highest one is deleted', () => {
    const runs = [running('t1'), running('t2'), running('t3')];

    // Reusing t3 would let the deleted timer's still-pending notifications be
    // adopted by its replacement.
    expect(nextRunId(runs)).toBe('t4');
    expect(nextRunId(runs.slice(0, 1))).toBe('t2');
  });

  it('starts at t1 for an empty list and ignores ids it does not recognise', () => {
    expect(nextRunId([])).toBe('t1');
    expect(nextRunId([{ id: 'legacy', state: createRun('legacy', config()).state }])).toBe('t1');
  });
});

describe('the run list', () => {
  it('appends up to the ceiling and then refuses', () => {
    let runs: TimerRun[] = [createRun('t1', config())];
    for (let i = 0; i < MAX_RUNS + 5; i += 1) runs = addRun(runs, config());

    expect(runs).toHaveLength(MAX_RUNS);
    expect(new Set(runs.map((run) => run.id)).size).toBe(MAX_RUNS);
  });

  it('removes a run but never the last one', () => {
    const runs = [running('t1'), running('t2')];

    expect(removeRun(runs, 't1').map((run) => run.id)).toEqual(['t2']);
    // An empty list would be a screen with nothing on it and no way back.
    expect(removeRun([running('t1')], 't1')).toHaveLength(1);
  });

  it('leaves every other run untouched when one transitions', () => {
    const runs = [running('t1'), running('t2')];
    const paused = updateRun(runs, 't1', (state) => pause(state, T0 + 10_000));

    expect(paused[0]!.state.status).toBe('paused');
    expect(paused[1]).toBe(runs[1]);
  });

  it('finds a run by id, and nothing for an unknown one', () => {
    const runs = [running('t1'), running('t2')];

    expect(findRun(runs, 't2')?.id).toBe('t2');
    expect(findRun(runs, 'nope')).toBeUndefined();
  });

  it('counts only the runs actually counting down', () => {
    const runs = [running('t1'), createRun('t2', config()), { id: 't3', state: pause(running('t3').state, T0 + 1) }];

    expect(runningRuns(runs).map((run) => run.id)).toEqual(['t1']);
  });
});

describe('normalizeRuns', () => {
  it('treats an unreadable store as a fresh install with one timer', () => {
    expect(normalizeRuns(null, T0, config())).toHaveLength(1);
    expect(normalizeRuns([], T0, config())).toHaveLength(1);
    expect(normalizeRuns('nonsense' as unknown as [], T0, config())[0]!.id).toBe('t1');
  });

  it('reassigns a duplicate id rather than dropping the run', () => {
    // Two runs sharing an id share notification keys, and one would silently
    // cancel the other's alerts.
    const runs = normalizeRuns([{ id: 't1' }, { id: 't1' }, { id: 't1' }], T0, config());

    expect(runs).toHaveLength(3);
    expect(new Set(runs.map((run) => run.id)).size).toBe(3);
  });

  it('repairs each run through the state normaliser', () => {
    const runs = normalizeRuns(
      [{ id: 't1', state: { status: 'running', accumulatedMs: 5_000, lastResumedAt: null } }],
      T0,
      config(),
    );

    // Running with nothing to measure from degrades to paused, keeping progress.
    expect(runs[0]!.state).toMatchObject({ status: 'paused', accumulatedMs: 5_000 });
  });

  it('caps an over-long stored list rather than overspending the budget', () => {
    const stored = Array.from({ length: MAX_RUNS + 6 }, (_, i) => ({ id: `t${i + 1}` }));

    expect(normalizeRuns(stored, T0, config())).toHaveLength(MAX_RUNS);
  });

  it('skips entries that are not objects at all', () => {
    const runs = normalizeRuns([null, 42, { id: 't1' }] as unknown as { id: string }[], T0, config());

    expect(runs).toHaveLength(1);
  });
});

describe('planRunAlerts', () => {
  it('plans nothing for runs that are not running', () => {
    expect(planRunAlerts([createRun('t1', config())], T0, 60)).toEqual([]);
    expect(planRunAlerts([running('t1')], T0, 0)).toEqual([]);
    expect(planRunAlerts([running('t1')], T0, Number.NaN)).toEqual([]);
  });

  it('interleaves several timers in fire order', () => {
    const runs = [
      running('t1', { workDurationMs: 60_000, repeats: 3, restDurationMs: 0 }),
      running('t2', { workDurationMs: 90_000, repeats: 2, restDurationMs: 0 }),
    ];

    const alerts = planRunAlerts(runs, T0, 60);

    expect(alerts.map((alert) => alert.fireAtMs - T0)).toEqual([60_000, 90_000, 120_000, 180_000, 180_000]);
    expect(alerts).toHaveLength(5);
  });

  /**
   * The reason the split is round-robin rather than chronological.
   *
   * Taking the next N alerts by fire time is the obvious implementation and is
   * quietly broken: a fast timer's boundaries fill the whole budget and the
   * slow one — the one you cannot sit and watch — never alerts at all.
   */
  it('guarantees every running timer its next boundary before any gets a second', () => {
    const greedy = running('t1', { workDurationMs: 30_000, repeats: 999, restDurationMs: 0 });
    const slow = running('t2', { workDurationMs: 2 * 60 * 60_000, repeats: 1, restDurationMs: 0 });

    const alerts = planRunAlerts([greedy, slow], T0, 60);
    const slowAlerts = alerts.filter((alert) => alert.runId === 't2');

    expect(slowAlerts).toHaveLength(1);
    expect(slowAlerts[0]!.fireAtMs - T0).toBe(2 * 60 * 60_000);
    expect(alerts).toHaveLength(60);
  });

  it('shares the budget evenly when every timer wants more than its share', () => {
    const runs = ['t1', 't2', 't3'].map((id) => running(id, { workDurationMs: 60_000, repeats: 999 }));

    const alerts = planRunAlerts(runs, T0, 30);
    const perRun = runs.map((run) => alerts.filter((alert) => alert.runId === run.id).length);

    expect(alerts).toHaveLength(30);
    expect(perRun).toEqual([10, 10, 10]);
  });

  it('gives the whole budget to the only running timer', () => {
    const runs = [running('t1', { workDurationMs: 60_000, repeats: 999 }), createRun('t2', config())];

    expect(planRunAlerts(runs, T0, 12)).toHaveLength(12);
  });

  it('stops cleanly when every timer runs out of boundaries before the budget does', () => {
    const runs = [running('t1', { repeats: 1, restDurationMs: 0 }), running('t2', { repeats: 1, restDurationMs: 0 })];

    expect(planRunAlerts(runs, T0, 60)).toHaveLength(2);
  });

  it('skips boundaries that have already gone by', () => {
    const runs = [running('t1', { workDurationMs: 60_000, repeats: 5, restDurationMs: 0 })];

    // Two and a half minutes in: the first two boundaries are already announced.
    const alerts = planRunAlerts(runs, T0 + 150_000, 60);

    expect(alerts.map((alert) => alert.phaseIndex)).toEqual([2, 3, 4]);
  });

  it('carries the name and voice of the run it belongs to', () => {
    const runs = [running('t1', { name: 'Bread', soundId: 'bell' }), running('t2', { name: 'Tea', soundId: 'pulse' })];

    const alerts = planRunAlerts(runs, T0, 60);

    expect(alerts.find((alert) => alert.runId === 't1')).toMatchObject({ title: 'Bread', soundId: 'bell' });
    expect(alerts.find((alert) => alert.runId === 't2')).toMatchObject({ title: 'Tea', soundId: 'pulse' });
  });

  it('keys every alert uniquely across all timers', () => {
    const runs = ['t1', 't2', 't3'].map((id) => running(id, { repeats: 20 }));
    const keys = planRunAlerts(runs, T0, 60).map((alert) => alert.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
