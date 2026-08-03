# Architecture

## The central decision

**Elapsed time is derived from wall-clock timestamps. It is never accumulated.**

A conventional timer keeps a `remaining` counter and decrements it on an
interval. On iOS that is broken by design:

- The OS suspends JavaScript timers when the app is backgrounded. The counter
  stops; the user's stretch does not.
- Even in the foreground, `setInterval` drifts. A "1000ms" interval fires late
  under load, and the errors accumulate.
- A JS thread stall drops ticks silently.

This app stores two numbers instead:

```ts
interface TimerState {
  accumulatedMs: number; // elapsed in previous run segments
  lastResumedAt: number | null; // epoch ms of the current segment
}
```

and computes `elapsed = accumulatedMs + (now - lastResumedAt)` on demand. The
100ms interval in `useTimer` exists **only to trigger a repaint**. If it fires
late, the display updates late; the time itself is never wrong. If the app is
frozen for ten minutes, the first tick after resuming lands on exactly the right
phase.

Everything else follows from this.

## Layers

```
┌──────────────────────────────────────────┐
│  features/timer   React components       │  Renders a projection.
│                   + useTimer hook        │  Holds no timing logic.
└───────────────┬──────────────────────────┘
                │ TimerProjection (a value)
┌───────────────▼──────────────────────────┐
│  core/timer      Pure TypeScript         │  All correctness lives here.
│                  No React. No RN.        │  Tested on plain Node.
└──────────────────────────────────────────┘
```

The boundary is enforced by ESLint, not by convention — `no-restricted-imports`
makes importing `react`, `react-native`, `expo*` or any UI module from
`src/core` an error. If the engine ever fails to compile under nothing but
`@babel/preset-typescript` (which is all the `core` Jest project provides), it
has grown a dependency it should not have.

## The engine

### `schedule.ts` — config becomes a timeline

`buildSchedule(config)` expands a config into an ordered list of phases, each
carrying absolute offsets from the start of the run:

```
work 0–120s   rest 120–150s   work 150–270s   rest 270–300s   work 300–420s
```

There is deliberately **no trailing rest** — a run ends the moment its last work
phase does.

Because every phase is positioned by offset, "what should be happening at
elapsed time T?" is a lookup (`findPhaseAt`, binary search) rather than a
simulation. That is what makes state recoverable after arbitrary suspension.

### Alerts fire off windows, not moments

```ts
phasesEndingBetween(schedule, fromMs, toMs); // (from, to] — half-open
```

Each tick asks "which phases ended since the last tick?" rather than "did the
countdown just hit zero?". The window is open at the bottom and closed at the
top, so feeding consecutive windows `(a,b]` then `(b,c]` fires every boundary
exactly once — no misses, no duplicates. A five-minute suspension opens a
five-minute window and reports all four boundaries inside it, in order.

The alternative — checking for zero each frame — misses every boundary that
passes while the app is not running.

### `machine.ts` — transitions are pure functions

Every function takes `(state, now)` and returns a new state. Nothing reads the
clock itself, so tests fast-forward eight hours instantly with fabricated
timestamps.

`project(state, now, schedule)` derives everything the UI shows. The UI has no
timing logic at all; it renders a value.

Two robustness details worth knowing:

- **Backwards clock.** `Math.max(0, now - lastResumedAt)` guards against NTP
  corrections and manual clock changes, which would otherwise rewind a run.
- **Completion is projected before it is stored.** A finished run reports
  `completed` from `project` while its stored `status` still says `running`.
  `settle()` writes that down; it is called in the toggle handler rather than in
  an effect, so React never sets state during render.

### `config.ts` — one trust boundary

`normalizeConfig` coerces arbitrary input — restored persisted state, raw text
input, anything — into a config that is guaranteed to pass `validateConfig`.
A property test asserts exactly that over hostile inputs (`NaN`, `Infinity`,
negatives, 500-character names). Downstream code therefore never defends against
a `NaN` duration.

## Testing strategy

Two Jest projects, because the halves have genuinely different needs.

|               | `core`                       | `app`           |
| ------------- | ---------------------------- | --------------- |
| Environment   | plain Node                   | `jest-expo/ios` |
| Transform     | TypeScript stripping only    | full RN preset  |
| Runtime       | ~1s                          | ~3s             |
| Coverage gate | 90% branches, 100% functions | none            |

The coverage threshold is deliberately asymmetric. In the engine, bugs are
expensive and tests are cheap, so the bar is high. In the UI, tests are
brittle and the payoff is lower, so they cover behaviour (does pausing hold
position?) rather than markup.

Component tests use fake timers with `jest.setSystemTime`, so a three-cycle run
completes in milliseconds. Note that React 19's `act` is asynchronous — every
advance and `fireEvent` must be awaited, or assertions read stale output.

### Property-based tests

`__tests__/properties.test.ts` uses [fast-check](https://fast-check.dev) to
assert _invariants_ over thousands of generated configs and timelines, rather
than the specific cases someone thought to write down. A timer is an unusually
good fit, because nearly every real defect lives in boundary arithmetic.

The invariants worth knowing:

- Phases tile the timeline with no gap, overlap or zero-length entry.
- However a run is chopped into windows — steady ticks or one ten-minute
  suspension — every boundary fires **exactly once, in order**.
- Elapsed time depends only on time spent _running_, never on how many pauses
  there were or how long they lasted.
- `normalizeConfig` turns literally any input (`fc.anything()`) into a config
  that passes `validateConfig`.

One lesson from writing them. The partition property originally drew window
sizes purely at random, and a deliberately introduced double-fire bug
(`>= fromMs` instead of `> fromMs`) **survived** it — random step sizes
essentially never land exactly on a phase boundary, which is the only case that
distinguishes the two. The generator now chains off the config so some steps
equal a phase duration exactly, and there is a separate property asserting the
half-open lower bound directly. Both now fail on that mutant.

That is the general trap with property tests: they only cover the space the
generator actually reaches. It is worth breaking the code on purpose to confirm
a property has teeth.

### The smoke test

`.maestro/smoke.yaml` drives the real binary on a simulator — the only check
that catches "the app crashes on launch". It is **off by default** in the
release pipeline; see [DEPLOYMENT.md](DEPLOYMENT.md#the-optional-smoke-test).
Deliberately shallow: deep UI assertions belong in the Jest suite, which is
faster, runs on Linux and does not flake.

## Configuration

`app.config.ts` is dynamic rather than a static `app.json`, so one source tree
builds development, preview and production variants from environment variables
with no file edits and nothing environment-specific committed. Variants get
distinct bundle identifiers (`.dev`, `.preview`) so they install side by side.

`platforms: ['ios']` — this is an iPhone app, and listing one platform stops
`expo start` offering targets that are neither supported nor tested.

## Generated native projects

`ios/` and `android/` are **gitignored**. `expo prebuild` recreates them from
`app.config.ts` on every build, which makes them output rather than source;
committing them lets the config and the native project silently diverge.

If you ever need custom native code, delete those lines from `.gitignore` and
commit `ios/` deliberately. The release workflow detects a committed `ios/`
directory and skips prebuild rather than clobbering it.

## Deliberate omissions in v0.1

- **No navigation library.** One screen does not need a router. Adding
  `expo-router` later touches `App.tsx` and nothing else.
- **No state management library.** One `useState` in one hook. Redux or Zustand
  would be pure ceremony at this size.
- **No persistence.** The engine is already built for it — `settle()` exists to
  make state clock-independent so it can be written to disk, and
  `normalizeConfig` exists to make reading it back safe.

## What comes next, and where it goes

| Feature              | Where it lands                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Alert sounds         | `src/services/audio.ts`, called from `TimerScreen`'s `onPhaseEnd`                              |
| Local notifications  | `src/services/notifications.ts` — schedule all boundaries up front from the schedule's offsets |
| Background operation | `UIBackgroundModes: ['audio']` in `app.config.ts` + an audio session                           |
| Saved presets        | `src/services/storage.ts` — persist `TimerConfig[]`, read back through `normalizeConfig`       |

The notification piece is where the schedule design pays off again: because
every phase already carries an absolute offset, scheduling the alerts is a `map`
over `schedule.phases`. Note iOS's cap of **64 pending local notifications** per
app — which is why `LIMITS.MAX_REPEATS` exists and why long runs will need
rolling re-scheduling rather than one up-front batch.
