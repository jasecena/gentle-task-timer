# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project conventions

**iPhone only.** `platforms: ['ios']`. Do not add Android or web targets.

**`src/core` is pure TypeScript.** No React, React Native or Expo imports —
ESLint enforces this. The `core` Jest project compiles it with nothing but
`@babel/preset-typescript`, so any new dependency there breaks the suite. That
is intentional: it is how the engine stays testable on Linux with no simulator.
Every core domain (`timer`, `reminders`, `alerts`) has its own coverage gate.

**Never accumulate elapsed time.** Derive it from wall-clock timestamps
(`accumulatedMs + (now - lastResumedAt)`). iOS suspends JS timers in the
background; a decrementing counter drifts and stops. Intervals exist only to
trigger repaints.

**Fire alerts off elapsed-time windows**, via `phasesEndingBetween(from, to]` —
not off a per-frame "did it hit zero?" check, which misses every boundary that
passes while the app is suspended.

**Run `npm run verify` before finishing.** Typecheck, lint, format check and 194
tests, in well under a minute.

**Never commit credentials.** `.gitignore` blocks the relevant patterns and
gitleaks scans history in CI, but the rule is simply: Apple credentials live
only in GitHub Secrets. See SECURITY.md.

**React 19 notes.** `act` is asynchronous — await it and `fireEvent` in tests.
So are `render`, `renderHook` and `rerender` in this version of the testing
library; not awaiting one leaves the act scope open and the _next_ render in the
file silently never runs its effects. Do not write refs during render or call
`setState` synchronously in an effect body; the lint rules catching both are
errors, not warnings.

# Settled decisions

These were worked out against the platform's limits and are not open to
casual revision. Changing one means changing the reasoning in
`docs/ARCHITECTURE.md` with it.

**Two modes, two domains.** `core/timer` models a run you start; `core/reminders`
models a standing arrangement anchored to wall-clock times. Do not merge them —
a schedule cannot be a timer run, because iOS will not let an app wake itself up.

**Every notification carries a `tag`; cancellation is always tag-scoped.** Never
call `cancelAllScheduledNotificationsAsync`. The two features share one pool of
pending notifications, so a blunt cancel means starting a timer silently wipes a
standing schedule — a bug that surfaces days later as an alert that never came.

**iOS holds 64 pending local notifications app-wide.** The split lives in
`core/alerts/budget.ts`: a schedule may claim 48, a run takes what is free. A
schedule over budget is **refused with the number shown**, never truncated —
scheduling 48 of 85 looks like it worked until the afternoon alerts stop.

**Schedules use weekly-repeating triggers, never dated ones.** That is what makes
them survive with the app closed indefinitely. Dated alerts run dry for anyone
who has not opened the app lately, silently.

**No `expo-notifications` config plugin in `app.config.ts`.** It writes an
`aps-environment` entitlement, which would require the Push Notifications
capability on the App ID. Local notifications need no capability at all. The
accepted cost: custom sound files cannot be bundled, so alerts use the system
default sound. The App ID has **zero capabilities** and should stay that way —
`interruptionLevel` stays `active` for the same reason (`timeSensitive` needs an
entitlement).

**Vibration length is a train of fixed pulses, foreground only.** iOS has no
"vibrate for N seconds" API and RN ignores pattern durations on iOS, honouring
only the gaps. Building the train needs JavaScript running, so with the app
closed a notification gets one system buzz and no setting changes that. Never
stack notifications to fake a longer buzz — it costs 3–4× the budget. **Off is a
real setting**: an empty pattern, with the platform call skipped entirely.

**Persisted state is untrusted input.** Everything read back through
`services/storage.ts` goes through a `normalize*` function first. Reads never
throw: an unreadable store is treated as a fresh install, because crashing on
launch over a bad preference file is the worse failure.

**Restoring a run must move the alert watermark** to the restored elapsed time.
Rewinding it to zero makes the first tick open a `(0, elapsed]` window and fire
every boundary already passed — reopen a 20-minute run and the phone buzzes
forty times.

**Native modules live behind `src/services`.** `notifications.ts` and
`storage.ts` are the only files importing `expo-notifications` and AsyncStorage.
Feature code builds values and hands them over.

**No navigation library.** Two tabs need no router. Both screens stay mounted
with the inactive one hidden — not an optimisation, but so that switching tabs
cannot throw away a running countdown.

Architecture rationale: `docs/ARCHITECTURE.md`. Release pipeline:
`docs/DEPLOYMENT.md`.
