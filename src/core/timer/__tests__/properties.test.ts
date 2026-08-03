import fc from 'fast-check';

import { ALERT_SOUNDS, RING_OPTIONS } from '../../alerts/sound';

import { LIMITS, normalizeConfig, validateConfig } from '../config';
import { formatDuration, fromParts, toParts } from '../format';
import { createTimer, elapsedMsAt, pause, project, reset, resume, settle, start } from '../machine';
import { buildSchedule, findPhaseAt, phasesEndingBetween } from '../schedule';
import type { TimerConfig } from '../types';

/**
 * Property-based tests for the timer engine.
 *
 * The enumerated tests in the sibling files pin down specific behaviours that
 * were reasoned about up front. These assert *invariants* over thousands of
 * randomly generated configs and timelines instead — the class of bug that
 * hand-picked cases miss, because you only write the case you already thought
 * of. A timer is an unusually good fit: nearly every real defect lives in
 * boundary arithmetic.
 */

const T0 = 1_700_000_000_000;

/** Configs drawn from the whole valid space, but kept small enough to stay fast. */
const arbConfig = (maxRepeats = 20): fc.Arbitrary<TimerConfig> =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: LIMITS.MAX_NAME_LENGTH }).map((s) => s.trim() || 'Timer'),
    workDurationMs: fc.integer({ min: LIMITS.MIN_WORK_MS, max: 10 * 60_000 }),
    // Zero is included deliberately — it is the "no rest phase" case, and it
    // changes the shape of the schedule rather than just a duration.
    restDurationMs: fc.oneof(fc.constant(0), fc.integer({ min: 1_000, max: 5 * 60_000 })),
    repeats: fc.integer({ min: LIMITS.MIN_REPEATS, max: maxRepeats }),
    // Off and every on-setting: vibration never affects the timeline, and the
    // invariants below should keep holding whatever it is set to.
    vibrationMs: fc.oneof(fc.constant(0), fc.integer({ min: 1_000, max: 10_000 })),
    // Likewise the voice: it changes what an alert sounds like and nothing
    // about when one happens.
    soundId: fc.constantFrom(...ALERT_SOUNDS.map((sound) => sound.id)),
    ringMs: fc.constantFrom(...RING_OPTIONS),
    // Governs whether a boundary announces itself, never where a boundary is.
    restEndAlert: fc.boolean(),
  });

describe('schedule invariants', () => {
  it('phases tile the timeline with no gaps, overlaps or zero-length entries', () => {
    fc.assert(
      fc.property(arbConfig(), (config) => {
        const schedule = buildSchedule(config);

        expect(schedule.phases.length).toBeGreaterThan(0);
        expect(schedule.phases[0]!.startOffsetMs).toBe(0);

        schedule.phases.forEach((phase, i) => {
          expect(phase.index).toBe(i);
          expect(phase.durationMs).toBeGreaterThan(0);
          expect(phase.endOffsetMs).toBe(phase.startOffsetMs + phase.durationMs);
          if (i > 0) {
            // Contiguity: each phase begins exactly where the previous ended.
            expect(phase.startOffsetMs).toBe(schedule.phases[i - 1]!.endOffsetMs);
          }
        });

        expect(schedule.phases.at(-1)!.endOffsetMs).toBe(schedule.totalDurationMs);
      }),
    );
  });

  it('contains exactly `repeats` work phases and never ends on a rest phase', () => {
    fc.assert(
      fc.property(arbConfig(), (config) => {
        const schedule = buildSchedule(config);
        const work = schedule.phases.filter((p) => p.kind === 'work');
        const rest = schedule.phases.filter((p) => p.kind === 'rest');

        expect(work).toHaveLength(config.repeats);
        expect(rest).toHaveLength(config.restDurationMs > 0 ? config.repeats - 1 : 0);
        // A run ends the moment its final work phase does.
        expect(schedule.phases.at(-1)!.kind).toBe('work');
      }),
    );
  });

  it('total duration equals the arithmetic sum of its parts', () => {
    fc.assert(
      fc.property(arbConfig(), (config) => {
        const schedule = buildSchedule(config);
        const restCount = config.restDurationMs > 0 ? config.repeats - 1 : 0;

        expect(schedule.totalDurationMs).toBe(
          config.repeats * config.workDurationMs + restCount * config.restDurationMs,
        );
      }),
    );
  });
});

describe('findPhaseAt', () => {
  it('returns the containing phase for every instant inside a run, and null outside it', () => {
    fc.assert(
      fc.property(arbConfig(10), fc.double({ min: 0, max: 1, noNaN: true }), (config, fraction) => {
        const schedule = buildSchedule(config);
        const t = Math.floor(fraction * schedule.totalDurationMs);

        const phase = findPhaseAt(schedule, t);
        if (t >= schedule.totalDurationMs) {
          expect(phase).toBeNull();
        } else {
          expect(phase).not.toBeNull();
          expect(t).toBeGreaterThanOrEqual(phase!.startOffsetMs);
          expect(t).toBeLessThan(phase!.endOffsetMs);
        }
      }),
    );
  });

  it('agrees with a linear scan (binary search has no off-by-one)', () => {
    fc.assert(
      fc.property(arbConfig(10), fc.nat(), (config, seed) => {
        const schedule = buildSchedule(config);
        const t = seed % Math.max(1, schedule.totalDurationMs + 5_000);

        const viaSearch = findPhaseAt(schedule, t);
        const viaScan = schedule.phases.find((p) => t >= p.startOffsetMs && t < p.endOffsetMs) ?? null;

        expect(viaSearch).toEqual(viaScan);
      }),
    );
  });
});

describe('phasesEndingBetween', () => {
  /**
   * The single most important property in the engine.
   *
   * However a run is chopped into windows — steady 100ms ticks, or one
   * ten-minute gap because iOS suspended the app — walking those windows must
   * report every phase boundary exactly once, in order. Miss one and an alert
   * never fires; double-count one and it fires twice.
   */
  it('fires every boundary exactly once, in order, for any partition of the run', () => {
    fc.assert(
      fc.property(
        // Steps are chained off the config so some of them equal a phase
        // duration exactly. That makes windows land *on* phase boundaries,
        // which is the only case that distinguishes the half-open lower bound
        // `> fromMs` from `>= fromMs` — purely random step sizes essentially
        // never hit it, and a double-fire bug would slip through.
        arbConfig(8).chain((config) => {
          const alignedSteps = [config.workDurationMs, config.restDurationMs].filter((d) => d > 0);
          return fc.tuple(
            fc.constant(config),
            fc.array(
              fc.oneof(
                // Wildly irregular gaps, far larger than any real tick, to
                // model the app being suspended in the background.
                fc.integer({ min: 1, max: 400_000 }),
                ...alignedSteps.map((d) => fc.constant(d)),
              ),
              { minLength: 1, maxLength: 60 },
            ),
          );
        }),
        ([config, steps]) => {
          const schedule = buildSchedule(config);

          const fired: number[] = [];
          let cursor = 0;
          for (const step of steps) {
            const next = Math.min(cursor + step, schedule.totalDurationMs);
            phasesEndingBetween(schedule, cursor, next).forEach((p) => fired.push(p.index));
            cursor = next;
            if (cursor >= schedule.totalDurationMs) break;
          }
          // Close out any remainder so the whole run is covered.
          phasesEndingBetween(schedule, cursor, schedule.totalDurationMs).forEach((p) => fired.push(p.index));

          expect(fired).toEqual(schedule.phases.map((p) => p.index));
        },
      ),
    );
  });

  /**
   * The half-open lower bound, asserted directly.
   *
   * A window opening exactly on a phase's end must not report that phase — it
   * was already reported by the window that closed on it. Getting this wrong
   * makes every alert fire twice whenever a tick happens to align with a
   * boundary.
   */
  it('does not re-report a boundary when the next window opens exactly on it', () => {
    fc.assert(
      fc.property(arbConfig(8), fc.nat(), fc.integer({ min: 1, max: 300_000 }), (config, index, width) => {
        const schedule = buildSchedule(config);
        const phase = schedule.phases[index % schedule.phases.length]!;

        const closing = phasesEndingBetween(schedule, Math.max(0, phase.startOffsetMs), phase.endOffsetMs);
        const opening = phasesEndingBetween(schedule, phase.endOffsetMs, phase.endOffsetMs + width);

        // Reported by the window that closes on it...
        expect(closing.map((p) => p.index)).toContain(phase.index);
        // ...and never again by the one that opens on it.
        expect(opening.map((p) => p.index)).not.toContain(phase.index);
      }),
    );
  });

  it('never reports anything for an empty or backwards window', () => {
    fc.assert(
      fc.property(arbConfig(5), fc.nat(), fc.nat(), (config, a, b) => {
        const schedule = buildSchedule(config);
        const hi = Math.max(a, b);
        const lo = Math.min(a, b);

        expect(phasesEndingBetween(schedule, hi, hi)).toEqual([]);
        if (lo !== hi) expect(phasesEndingBetween(schedule, hi, lo)).toEqual([]);
      }),
    );
  });
});

describe('projection invariants', () => {
  it('never produces an out-of-range value at any instant of any run', () => {
    fc.assert(
      fc.property(arbConfig(10), fc.nat(), (config, offset) => {
        const schedule = buildSchedule(config);
        // Deliberately allowed to run past the end of the timeline.
        const t = offset % (schedule.totalDurationMs + 60_000);
        const view = project(start(createTimer(config), T0), T0 + t, schedule);

        expect(view.elapsedMs).toBeGreaterThanOrEqual(0);
        expect(view.elapsedMs).toBeLessThanOrEqual(schedule.totalDurationMs);
        expect(view.totalRemainingMs).toBeGreaterThanOrEqual(0);
        expect(view.elapsedMs + view.totalRemainingMs).toBe(schedule.totalDurationMs);

        expect(view.progress).toBeGreaterThanOrEqual(0);
        expect(view.progress).toBeLessThanOrEqual(1);

        expect(view.completedCycles).toBeGreaterThanOrEqual(0);
        expect(view.completedCycles).toBeLessThanOrEqual(view.totalCycles);
        expect(view.currentCycle).toBeGreaterThanOrEqual(1);
        expect(view.currentCycle).toBeLessThanOrEqual(view.totalCycles);

        expect(view.phaseRemainingMs).toBeGreaterThanOrEqual(0);
        if (view.phase) {
          expect(view.phaseElapsedMs + view.phaseRemainingMs).toBe(view.phase.durationMs);
        }
      }),
    );
  });

  it('progress advances monotonically as the clock does', () => {
    fc.assert(
      fc.property(arbConfig(6), fc.array(fc.integer({ min: 0, max: 90_000 }), { maxLength: 25 }), (config, steps) => {
        const schedule = buildSchedule(config);
        const state = start(createTimer(config), T0);

        let t = 0;
        let previous = 0;
        for (const step of steps) {
          t += step;
          const elapsed = project(state, T0 + t, schedule).elapsedMs;
          expect(elapsed).toBeGreaterThanOrEqual(previous);
          previous = elapsed;
        }
      }),
    );
  });
});

describe('pause and resume', () => {
  /**
   * Elapsed time must depend only on how long the timer was *running*, never on
   * how many times it was paused or how long the pauses lasted. This is the
   * property that makes the timer trustworthy when someone parks it mid-set.
   */
  it('total elapsed depends only on time spent running', () => {
    fc.assert(
      fc.property(
        arbConfig(6),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 30_000 }), fc.integer({ min: 1, max: 600_000 })), {
          minLength: 1,
          maxLength: 12,
        }),
        (config, segments) => {
          const schedule = buildSchedule(config);
          let state = createTimer(config);
          let clock = T0;
          let running = 0;

          state = start(state, clock);
          for (const [runFor, pauseFor] of segments) {
            clock += runFor;
            running += runFor;
            state = pause(state, clock);
            clock += pauseFor; // time passes, but the timer is paused
            state = resume(state, clock);
          }

          // Paused intervals contributed nothing, however long they were.
          expect(elapsedMsAt(state, clock, schedule)).toBe(Math.min(running, schedule.totalDurationMs));
        },
      ),
    );
  });

  it('reset always returns a clean idle timer, from any state', () => {
    fc.assert(
      fc.property(arbConfig(5), fc.nat({ max: 600_000 }), (config, t) => {
        const state = reset(start(createTimer(config), T0));

        expect(state).toMatchObject({ status: 'idle', accumulatedMs: 0, lastResumedAt: null });
        // Idle state does not move, no matter when it is read.
        expect(elapsedMsAt(state, T0 + t)).toBe(0);
      }),
    );
  });

  it('settle is idempotent and freezes the run at exactly its total duration', () => {
    fc.assert(
      fc.property(arbConfig(6), fc.nat({ max: 600_000 }), (config, extra) => {
        const schedule = buildSchedule(config);
        const finishedAt = T0 + schedule.totalDurationMs + extra;

        const once = settle(start(createTimer(config), T0), finishedAt, schedule);
        const twice = settle(once, finishedAt + 5_000, schedule);

        expect(once.status).toBe('completed');
        expect(once.accumulatedMs).toBe(schedule.totalDurationMs);
        expect(twice).toEqual(once);
      }),
    );
  });
});

describe('normalizeConfig', () => {
  /**
   * The trust boundary. Persisted state from an older build, or a value typed
   * into a field, can be literally anything — so this is asserted against
   * arbitrary values rather than a hand-written list of nasty inputs.
   */
  it('turns absolutely any input into a valid config', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const config = normalizeConfig(input as Partial<TimerConfig>);

        expect(validateConfig(config)).toEqual([]);
        expect(Number.isInteger(config.workDurationMs)).toBe(true);
        expect(Number.isInteger(config.restDurationMs)).toBe(true);
        expect(Number.isInteger(config.repeats)).toBe(true);
        expect(config.name.length).toBeGreaterThan(0);
        expect(config.name.length).toBeLessThanOrEqual(LIMITS.MAX_NAME_LENGTH);
        expect(ALERT_SOUNDS.map((sound) => sound.id)).toContain(config.soundId);
      }),
    );
  });

  it('is idempotent — normalising an already-valid config changes nothing', () => {
    fc.assert(
      fc.property(arbConfig(), (config) => {
        expect(normalizeConfig(normalizeConfig(config))).toEqual(normalizeConfig(config));
      }),
    );
  });
});

describe('formatting', () => {
  it('always produces a well-formed clock string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 24 * 60 * 60 * 1_000 }), (ms) => {
        expect(formatDuration(ms)).toMatch(/^(\d+:)?\d{2}:\d{2}$/);
      }),
    );
  });

  it('is monotonic: more time left never displays as less', () => {
    fc.assert(
      fc.property(fc.nat({ max: 3_600_000 }), fc.nat({ max: 3_600_000 }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        // Compare as total seconds so string ordering is not an issue.
        expect(Math.ceil(lo / 1000)).toBeLessThanOrEqual(Math.ceil(hi / 1000));
        if (formatDuration(lo) !== formatDuration(hi)) {
          expect(Math.ceil(lo / 1000)).toBeLessThan(Math.ceil(hi / 1000));
        }
      }),
    );
  });

  it('round-trips any whole-second duration through toParts/fromParts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 86_399 }), (seconds) => {
        expect(fromParts(toParts(seconds * 1_000))).toBe(seconds * 1_000);
      }),
    );
  });
});
