# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project conventions

**iPhone only.** `platforms: ['ios']`. Do not add Android or web targets.

**`src/core` is pure TypeScript.** No React, React Native or Expo imports —
ESLint enforces this. The `core` Jest project compiles it with nothing but
`@babel/preset-typescript`, so any new dependency there breaks the suite. That
is intentional: it is how the engine stays testable on Linux with no simulator.
Every core domain (`timer`, `reminders`, `oneoffs`, `clock`, `alerts`) has its
own coverage gate. `core` also reads no clock and no entropy source: ids are
derived from the ids already in use, and "what time is it" is a parameter.

**Never accumulate elapsed time.** Derive it from wall-clock timestamps
(`accumulatedMs + (now - lastResumedAt)`). iOS suspends JS timers in the
background; a decrementing counter drifts and stops. Intervals exist only to
trigger repaints.

**Fire alerts off elapsed-time windows**, via `phasesEndingBetween(from, to]` —
not off a per-frame "did it hit zero?" check, which misses every boundary that
passes while the app is suspended.

**Run `npm run verify` before finishing.** Typecheck, lint, format check and 291
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

**Three modes, three domains.** `core/timer` models runs you start;
`core/reminders` models a standing arrangement anchored to wall-clock times;
`core/oneoffs` models a single note on a chosen day. Do not merge them — a
schedule cannot be a timer run, because iOS will not let an app wake itself up,
and a one-off is neither. The wall-clock vocabulary they share (weekdays,
minutes of the day) lives in `core/clock` and belongs to none of them.

**Timers are a list, and the engine did not change to make that true.** A run
was already `(state, now) => state` over two numbers, so N runs are
`core/timer/runs.ts` plus one shared tick. Do not give each timer its own
interval, and do not let a timer plan its alerts alone — see the budget rule
below.

**A timer's name is the title of every alert it posts.** With several running it
is the only thing on a banner that says which one finished, which is why
`addRun` refuses to create two timers with the same default name.

**Every notification carries a `tag`; cancellation is always tag-scoped.** Never
call `cancelAllScheduledNotificationsAsync`. The two features share one pool of
pending notifications, so a blunt cancel means starting a timer silently wipes a
standing schedule — a bug that surfaces days later as an alert that never came.

**iOS holds 64 pending local notifications app-wide.** The split lives in
`core/alerts/budget.ts`: a schedule may claim 48 and one-off notes 8, both
refused at the editor rather than truncated; running timers share whatever is
left. A schedule over budget is **refused with the number shown**, never
truncated — scheduling 48 of 85 looks like it worked until the afternoon alerts
stop.

**Running timers share one budget, round-robin, never chronologically.**
`planRunAlerts` deals one alert to each running timer in turn. Taking the next N
by fire time is the obvious implementation and is silently broken: a 999-cycle
one-minute timer fills the entire budget and the two-hour timer beside it — the
one you cannot sit and watch — never alerts at all.

**Alert keys are namespaced by run id** (`run-<id>-phase-<n>`). iOS treats a
repeated identifier as a replace, so a bare `phase-3` means the second timer
silently cancels the first timer's alerts.

**Schedules use weekly-repeating triggers, never dated ones.** That is what makes
them survive with the app closed indefinitely. Dated alerts run dry for anyone
who has not opened the app lately, silently.

**One-off notes use a non-repeating calendar trigger, never a dated one.** iOS
resolves a weekday and an hour/minute to the next matching moment in local time,
so the app does no date arithmetic and nothing is an hour wrong after the clocks
change. It is also how a fired note is detected: it leaves the pending list when
delivered, so `pruneFired` asks iOS what it still holds rather than comparing
clocks. A failed read returns `null` and prunes **nothing** — "I could not ask"
is not "everything fired".

**The `expo-notifications` config plugin is in `app.config.ts`, for `sounds`
alone.** A custom notification sound must be a file in the app bundle, and the
plugin's `sounds` array is the only supported way to put one there. It also
writes an `aps-environment` entitlement, so the App ID **must** have the Push
Notifications capability enabled or cloud signing cannot issue a profile. That
was a deliberate trade made in v0.3, reversing the v0.2 decision; it is the only
capability the app has and it should stay that way. `interruptionLevel` stays
`active` — `timeSensitive` needs a _separate_ entitlement and is not covered by
this one.

**Alert sounds are synthesised, by `scripts/make-alert-sounds.py`.** Regenerate
rather than hand-editing `assets/sounds/*.wav`. Synthesised means no licence and
nothing to declare at App Review. An unknown sound id falls back to the system
sound in `normalizeSoundId`, because iOS delivers a notification whose sound
file it cannot resolve **silently** — which reads as a broken alert.

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
forty times. There is one watermark per run.

**The Jest suite is pinned to UTC** in `jest.config.js`, before the workers fork.
One-off notes are wall-clock times, so without it `jest.setSystemTime` means a
different weekday depending on where the machine is.

**Native modules live behind `src/services`.** `notifications.ts` and
`storage.ts` are the only files importing `expo-notifications` and AsyncStorage.
Feature code builds values and hands them over.

**No navigation library.** Three tabs need no router. Every screen stays mounted
with the inactive ones hidden — not an optimisation, but so that switching tabs
cannot throw away a running countdown.

Architecture rationale: `docs/ARCHITECTURE.md`. Release pipeline:
`docs/DEPLOYMENT.md`.
