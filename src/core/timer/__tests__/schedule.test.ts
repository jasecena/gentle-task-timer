import { buildSchedule, completedCyclesAt, findPhaseAt, phasesEndingBetween } from '../schedule';
import type { TimerConfig } from '../types';

const config = (overrides: Partial<TimerConfig> = {}): TimerConfig => ({
  name: 'Test',
  workDurationMs: 120_000,
  restDurationMs: 30_000,
  repeats: 3,
  vibrationMs: 3_000,
  soundId: 'default',
  ...overrides,
});

describe('buildSchedule', () => {
  it('interleaves work and rest without a trailing rest phase', () => {
    const schedule = buildSchedule(config());

    expect(schedule.phases.map((p) => p.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work']);
    expect(schedule.totalDurationMs).toBe(3 * 120_000 + 2 * 30_000);
    expect(schedule.totalCycles).toBe(3);
  });

  it('omits rest phases entirely when rest duration is zero', () => {
    const schedule = buildSchedule(config({ restDurationMs: 0 }));

    expect(schedule.phases.map((p) => p.kind)).toEqual(['work', 'work', 'work']);
    expect(schedule.totalDurationMs).toBe(360_000);
  });

  it('produces a single phase for a one-repeat timer', () => {
    const schedule = buildSchedule(config({ repeats: 1 }));

    expect(schedule.phases).toHaveLength(1);
    expect(schedule.phases[0]).toMatchObject({ kind: 'work', cycle: 1, startOffsetMs: 0, endOffsetMs: 120_000 });
    expect(schedule.totalDurationMs).toBe(120_000);
  });

  it('lays phases end to end with no gaps or overlaps', () => {
    const schedule = buildSchedule(config({ repeats: 10 }));

    let expectedStart = 0;
    schedule.phases.forEach((phase, i) => {
      expect(phase.index).toBe(i);
      expect(phase.startOffsetMs).toBe(expectedStart);
      expect(phase.endOffsetMs).toBe(phase.startOffsetMs + phase.durationMs);
      expectedStart = phase.endOffsetMs;
    });
    expect(expectedStart).toBe(schedule.totalDurationMs);
  });

  it('attributes a rest phase to the cycle it follows', () => {
    const schedule = buildSchedule(config());

    expect(schedule.phases.map((p) => p.cycle)).toEqual([1, 1, 2, 2, 3]);
  });
});

describe('findPhaseAt', () => {
  const schedule = buildSchedule(config());

  it('treats a phase as owning [start, end)', () => {
    // Boundary at 120_000 belongs to the rest phase that is starting.
    expect(findPhaseAt(schedule, 119_999)).toMatchObject({ kind: 'work', cycle: 1 });
    expect(findPhaseAt(schedule, 120_000)).toMatchObject({ kind: 'rest', cycle: 1 });
    expect(findPhaseAt(schedule, 150_000)).toMatchObject({ kind: 'work', cycle: 2 });
  });

  it('returns the first phase at elapsed zero', () => {
    expect(findPhaseAt(schedule, 0)).toMatchObject({ kind: 'work', cycle: 1 });
  });

  it('returns null once the run is over', () => {
    expect(findPhaseAt(schedule, schedule.totalDurationMs)).toBeNull();
    expect(findPhaseAt(schedule, schedule.totalDurationMs + 60_000)).toBeNull();
  });

  it('clamps negative elapsed values to the first phase', () => {
    expect(findPhaseAt(schedule, -5_000)).toMatchObject({ kind: 'work', cycle: 1 });
  });

  it('agrees with a linear scan across a long schedule', () => {
    const long = buildSchedule(config({ workDurationMs: 5_000, restDurationMs: 3_000, repeats: 200 }));

    for (let t = 0; t < long.totalDurationMs; t += 137) {
      const viaBinarySearch = findPhaseAt(long, t);
      const viaScan = long.phases.find((p) => t >= p.startOffsetMs && t < p.endOffsetMs) ?? null;
      expect(viaBinarySearch).toEqual(viaScan);
    }
  });
});

describe('phasesEndingBetween', () => {
  const schedule = buildSchedule(config());

  it('reports a boundary exactly once across consecutive windows', () => {
    expect(phasesEndingBetween(schedule, 119_000, 120_000)).toHaveLength(1);
    expect(phasesEndingBetween(schedule, 120_000, 121_000)).toHaveLength(0);
  });

  it('catches every boundary missed while the app was frozen', () => {
    // Suspended at t=0, woken at t=5min. Phases end at 120s, 150s, 270s and
    // 300s, so four boundaries went by unseen and all four must be reported —
    // a per-frame "did it hit zero?" check would have caught none of them.
    const crossed = phasesEndingBetween(schedule, 0, 300_000);

    expect(crossed.map((p) => p.kind)).toEqual(['work', 'rest', 'work', 'rest']);
    expect(crossed.map((p) => p.endOffsetMs)).toEqual([120_000, 150_000, 270_000, 300_000]);
  });

  it('returns nothing for an empty or backwards window', () => {
    expect(phasesEndingBetween(schedule, 5_000, 5_000)).toEqual([]);
    expect(phasesEndingBetween(schedule, 9_000, 1_000)).toEqual([]);
  });

  it('fires every boundary exactly once when the whole run is walked in small steps', () => {
    const fired: number[] = [];
    const step = 250;
    for (let t = 0; t < schedule.totalDurationMs + step; t += step) {
      phasesEndingBetween(schedule, t, t + step).forEach((p) => fired.push(p.index));
    }

    expect(fired).toEqual(schedule.phases.map((p) => p.index));
  });
});

describe('completedCyclesAt', () => {
  const schedule = buildSchedule(config());

  it('counts only work phases that have fully finished', () => {
    expect(completedCyclesAt(schedule, 0)).toBe(0);
    expect(completedCyclesAt(schedule, 119_999)).toBe(0);
    expect(completedCyclesAt(schedule, 120_000)).toBe(1);
    expect(completedCyclesAt(schedule, 150_000)).toBe(1); // during rest, cycle 1 is done
    expect(completedCyclesAt(schedule, schedule.totalDurationMs)).toBe(3);
  });
});
