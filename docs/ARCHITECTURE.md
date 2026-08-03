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
│  shell           Two tabs, both mounted  │
├──────────────────────────────────────────┤
│  features/*      React components        │  Render a projection.
│                  + their hooks           │  Hold no timing logic.
├──────────────────────────────────────────┤
│  services/*      expo-notifications,     │  The only files that touch
│                  AsyncStorage            │  a native module.
└───────────────┬──────────────────────────┘
                │ values, in both directions
┌───────────────▼──────────────────────────┐
│  core/timer      Pure TypeScript         │  All correctness lives here.
│  core/reminders  No React. No RN.        │  Tested on plain Node.
│  core/alerts                             │
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

|               | `core`                                   | `app`           |
| ------------- | ---------------------------------------- | --------------- |
| Environment   | plain Node                               | `jest-expo/ios` |
| Transform     | TypeScript stripping only                | full RN preset  |
| Runtime       | ~2s                                      | ~4s             |
| Coverage gate | 90% branches, 100% functions, per domain | none            |

The coverage threshold is deliberately asymmetric. In the engine, bugs are
expensive and tests are cheap, so the bar is high. In the UI, tests are
brittle and the payoff is lower, so they cover behaviour (does pausing hold
position?) rather than markup.

Component tests use fake timers with `jest.setSystemTime`, so a three-cycle run
completes in milliseconds. Note that React 19's `act` is asynchronous, and in
this version of the testing library `render`, `renderHook` and `rerender` are
too — every one must be awaited. Not awaiting leaves the act scope open, and the
_next_ render in the file silently never runs its effects.

Two native modules are stubbed for the `app` project:

- `__mocks__/expo-notifications.ts` keeps a **queue** rather than just recording
  calls, because the behaviour worth testing is stateful — "did rescheduling the
  timer wipe the standing schedule?" is a question a call log cannot answer.
- AsyncStorage uses the in-memory stand-in the package ships. It keeps its
  contents for a whole file, so tests that persist anything clear it in
  `beforeEach` or inherit the previous test's timer.

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

## Deliberate omissions

- **No navigation library.** Two tabs need no router, no navigation state and no
  native screen container. `src/shell/TabShell.tsx` is one file and adds nothing
  to the build. Both screens stay mounted with the inactive one hidden — not an
  optimisation, but so that glancing at the schedule tab does not throw away a
  running countdown.
- **No state management library.** Two hooks holding `useState`. Redux or
  Zustand would be pure ceremony at this size. The schedule's state is lifted
  into the shell only because the timer needs to know how many notification
  slots it has left.

## Two modes, one engine each

The app does two different things, and they are different enough to deserve
separate domains rather than one flexible one.

|             | Timer                            | Schedule                             |
| ----------- | -------------------------------- | ------------------------------------ |
| Models      | a run you start                  | a standing arrangement               |
| Anchored to | an instant (`lastResumedAt`)     | wall-clock times (`09:00`, Tuesdays) |
| Alerts      | dated, re-planned as it advances | weekly-repeating, scheduled once     |
| Needs       | the app open to count down       | nothing at all                       |
| Lives in    | `src/core/timer`                 | `src/core/reminders`                 |

Trying to express "every 30 minutes between 9 and 5 on weekdays" as a timer run
would mean a run that starts itself, which iOS does not permit — an app cannot
wake up on its own. Expressed as _weekly repeating notifications_ it needs no
background execution whatsoever: the arrangement is handed to iOS once, and iOS
delivers it whether the app is open, closed or force-quit for a month.

That is also why the reminders domain holds no dates. A slot is a weekday and a
minute of the day, which is what makes it repeat forever; a list of dated alerts
would silently run dry for anyone who had not opened the app in a while.

## Alerts: two paths, one boundary

A phase ending has to reach the user whether or not the app is on screen, and
the two situations need completely different machinery.

| With the app in front           | With it backgrounded, locked or killed        |
| ------------------------------- | --------------------------------------------- |
| `phasesEndingBetween(from, to]` | Local notifications, handed to iOS in advance |
| Vibration, fired from JS        | Banner and sound, delivered by the OS         |

The in-app path only works while JavaScript is running, which on iOS means only
in the foreground. The notification path covers everything else — and this is
where the schedule design pays off again: because every phase already carries an
absolute offset, planning the alerts is a walk over `schedule.phases` adding
`runStartedAtMs` to each `endOffsetMs`.

That walk is `planAlerts` in `src/core/timer/alerts.ts`, and it is pure: it
returns a list of `{ fireAtMs, title, body }`, so the copy and every boundary
are unit-testable on Linux. `src/services/notifications.ts` is the only file
that imports `expo-notifications`, and `useTimerAlerts` re-plans whenever the
timer state changes or the app is foregrounded.

Two constraints shape it:

- **The `expo-notifications` config plugin writes an `aps-environment`
  entitlement**, which would require the Push Notifications capability on the
  App ID. The plugin is therefore deliberately _not_ in `app.config.ts`: local
  notifications need no capability at all. The cost is that custom sound files
  cannot be bundled, so alerts use the system default sound.
- **iOS holds at most 64 pending local notifications**, which is the subject of
  the next section.

## The 64-notification budget

iOS keeps at most **64 pending local notifications per app** and silently drops
the rest. Not 64 per feature — 64 in total, and both modes want slots. Two
consequences run through the code:

- **Cancellation is tag-scoped.** Every notification carries `data.tag` of
  `run` or `reminder`, and each feature cancels only its own. A blunt
  `cancelAllScheduledNotificationsAsync` would mean rescheduling a timer wipes a
  standing schedule — the kind of bug that surfaces days later as a reminder
  that never arrived.
- **The ceiling is divided, in `src/core/alerts/budget.ts`.** A schedule may
  claim up to 48; a run takes what is free (`runAlertBudget`), capped at 60 when
  nothing else is pending. A run refills its window on every re-plan, so a
  smaller share costs reach into the future rather than correctness. A schedule
  cannot refill — it repeats forever — which is why it gets the fixed, smaller
  allowance.

A schedule that would exceed its allowance is **refused, with the number shown**
("85 alerts a week. iPhone allows 48"). Silently scheduling 48 of 85 would look
like it worked, right up until the afternoon alerts stopped.

## Vibration length

iOS has no "vibrate for N seconds" API. The only primitive is a fixed ~400ms
system buzz, and React Native's `Vibration.vibrate` ignores the durations in a
pattern on iOS, honouring only the gaps. So a 3-second vibration is a _train_ of
buzzes spaced to fill 3 seconds, built by `buildVibrationPattern` in
`src/core/alerts/vibration.ts` — pure, so "does a 5s setting ever run past 5s?"
is a unit test rather than a stopwatch.

Distinct rhythms (`single`, `double`, `triple`) make work-end, rest-end and
run-end tellable apart in a pocket even when they last the same time.

Two limits are worth stating plainly, because they are the platform's and not
the app's:

- **Foreground only.** Driving a train needs JavaScript running. With the app
  closed, a notification gets iOS's own single buzz and no setting can lengthen
  it. Stacking notifications to fake a longer buzz was considered and rejected:
  it costs 3–4× the notification budget and leaves a pile of banners.
- **Off is a real setting**, not a zero-length buzz. `buildVibrationPattern`
  returns an empty array and callers skip the platform call entirely.

`Vibration.cancel()` stops a train part-way, which is what any deliberate press
on the timer's controls does — a ten-second buzz you cannot interrupt is a
misfeature.

## Persistence

The store is `src/services/storage.ts`, the only file that touches
AsyncStorage, and everything read back goes through a `normalize*` function
first: stored data is untrusted input like any other.

A run persists as the same two numbers the engine works in — accumulated
milliseconds and a resume timestamp — so restoring it is not a replay. Close the
app twenty minutes into a run and it comes back twenty minutes further along,
because elapsed time was never counted in the first place.

Two details that would be bugs if missed:

- `normalizeState` degrades a run marked `running` with no resume timestamp to
  `paused` (there is nothing to measure from), and pins a _future_ timestamp to
  now (the clock moved backwards while the app was closed).
- `restore` in `useTimer` moves the alert watermark to the restored elapsed
  time. Rewinding it to zero would make the first tick after a restore open a
  window of `(0, elapsed]` and fire an alert for every boundary already passed —
  reopen a 20-minute-old run and the phone buzzes forty times.

## What comes next, and where it goes

| Feature              | Where it lands                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Custom alert sounds  | The `expo-notifications` plugin's `sounds` array — read the entitlement note above first |
| Background operation | `UIBackgroundModes: ['audio']` in `app.config.ts` + an audio session                     |
| Saved presets        | `src/services/storage.ts` — persist `TimerConfig[]`, read back through `normalizeConfig` |
