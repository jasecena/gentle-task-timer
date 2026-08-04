# Gentle Task Timer

[![CI](https://github.com/jasecena/gentle-task-timer/actions/workflows/ci.yml/badge.svg)](https://github.com/jasecena/gentle-task-timer/actions/workflows/ci.yml)
[![Security](https://github.com/jasecena/gentle-task-timer/actions/workflows/security.yml/badge.svg)](https://github.com/jasecena/gentle-task-timer/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Three ways to be nudged, on iPhone.

**Timers** — up to eight repeating interval runs, in parallel: each with a
duration, a number of repeats and an optional rest between cycles. They count
down independently and alert you at every boundary, by name.

**Once** — a note, on a day, at a time. It arrives exactly once, says what you
wrote, and then removes itself.

**Schedule** — a standing arrangement: every 30 minutes, 09:00–17:00, weekdays.
Nothing counts down and nothing needs the app open.

Every alert can play one of four bundled sounds, the system one, or nothing at
all — short or ringing for ten seconds.

Built and released entirely from Linux — no Mac at any point.

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│       Timers        │  │        Once         │  │      Schedule       │
│  2 of 8 · 2 running │  │  2 of 8 notes wait  │  │  Every 30m, Mon–Fri │
│ ┌─────────────────┐ │  │ ┌─────────────────┐ │  │                     │
│ │ Bread        ⌄  │ │  │ │ Call the vet    │ │  │  Every        30m   │
│ │ 45m total       │ │  │ │       84 left    │ │  │  From       09:00   │
│ │      WORK       │ │  │ └─────────────────┘ │  │  Until      17:00   │
│ │      12:31      │ │  │  S (M) T  W  T  F S │  │  Vibration     3s   │
│ │  ▓▓▓▓▓░░░░░░░░  │ │  │  At         09:00   │  │  Sound      Chime   │
│ │ ┌──────┐┌─────┐ │ │  │  Sound       Bell   │  │  S (M)(T)(W)(T)(F)S │
│ │ │Pause ││Reset│ │ │  │ ┌─────────────────┐ │  │                     │
│ │ └──────┘└─────┘ │ │  │ │    Add note     │ │  │  85 of 48 alerts/wk │
│ └─────────────────┘ │  │ └─────────────────┘ │  │  17 a day × 5 days  │
│ ┌─────────────────┐ │  │                     │  │                     │
│ │ Stretch      ⌄  │ │  │ Bins out            │  │ ┌─────────────────┐ │
│ │      REST       │ │  │ Friday 20:00        │  │ │      Start      │ │
│ │      00:18      │ │  │ in 1 day     Delete │  │ └─────────────────┘ │
│ └─────────────────┘ │  │                     │  │                     │
│  ┌ + Add timer ──┐  │  │                     │  │                     │
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│ ⏱Timers ✎Once 📅Sch │  │ ⏱Timers ✎Once 📅Sch │  │ ⏱Timers ✎Once 📅Sch │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

## Status

v0.4.3 is the current release. Scope:

**Timers**

- [x] Up to eight timers running in parallel, each independent
- [x] Swipe a timer or a note left to delete it (an ordinary button is always
      there too — a swipe is invisible to VoiceOver)
- [x] Named timer, work duration (30s minimum), repeat count, optional rest
- [x] Start / pause / resume / reset, per timer
- [x] Per-phase and whole-run progress
- [x] Optional alert when a rest ends — off by default, on for sets and reps
- [x] Runs survive force-quitting the app, and come back where they should be
- [x] Screen stays awake while any is running, releases when the last stops
- [x] Correct across backgrounding, JS stalls and wall-clock changes

**Once**

- [x] A free-text note, a weekday and a time — delivered once, then forgotten
- [x] Native iOS time wheel, here and on the schedule window
- [x] Arrives with the app closed; iOS resolves the next occurrence in local
      time, so it survives daylight saving
- [x] Stays in Notification Centre, unlike a timer alert
- [x] Fired notes prune themselves; pending ones can be deleted individually

**Schedule**

- [x] Repeat every N minutes inside a window, on chosen weekdays
- [x] Keeps alerting with the app closed — weekly-repeating notifications, no
      background execution
- [x] Live alert count against the notification budget, with over-budget
      schedules refused rather than silently truncated
- [x] One-press stop

**Alerts, all three modes**

- [x] Local notifications, so boundaries reach you with the app closed or the
      screen locked. Timer alerts are titled with the timer's name
- [x] Choice of alert sound — Default, Silent, Chime, Bell, Marimba or Pulse —
      bundled and synthesised, playing with the app closed, and previewable in
      the picker before you commit. **Requires the Push Notifications capability
      on the App ID**; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [x] Ring length — short, or ten seconds. A longer bundled file, played to its
      end by iOS; it cannot be stopped early and no app can do better
- [x] Silent alerts, for vibration without noise. With the app closed the buzz
      is your Ring/Silent switch, which no app can override
- [x] Vibration of a chosen length — off, 1s, 3s, 5s or 10s — with distinct
      rhythms per alert kind. Foreground only; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [x] All three features share iOS's 64-notification ceiling deliberately, and
      running timers share their slice round-robin so a slow timer is never
      starved by a fast one
- [x] **In-app alert mode** — per timer and per schedule, costs zero notification
      slots, so any frequency is allowed. Alerts only while the app is open
- [ ] Renaming a timer from the UI
- [ ] Saved presets
- [ ] Background audio session for true background operation

## Quick start

```bash
npm install
npm start          # then scan the QR code with your iPhone camera
```

You need the free **Expo Go** app from the App Store. No Apple Developer
account, no Mac, no build step — the app hot-reloads onto your phone from this
machine.

```bash
npm run verify     # typecheck + lint + format check + tests. Run before pushing.
npm test           # 352 tests, ~7s
npm run test:watch
```

## Getting it onto your phone as a real app

Follow **[docs/GENTLE_TASK_TIMER_SETUP.md](docs/GENTLE_TASK_TIMER_SETUP.md)** — the concrete
checklist for this app. Reference detail and troubleshooting live in
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. Short version: push a `v*` tag
and a GitHub-hosted macOS runner archives, signs and uploads to TestFlight.
Requires an Apple Developer Program membership (US$99/yr); the doc also covers
the free alternatives and their tradeoffs.

## How it is put together

The one idea worth knowing: **the timer engine is pure TypeScript with no
React, React Native or Expo imports**, and elapsed time is always derived from
wall-clock timestamps rather than counted in ticks.

That buys two things:

1. **Correctness.** iOS suspends JS timers in the background. A timer that
   decrements a counter on an interval drifts or stops; one that computes
   `now - startedAt` is exact no matter how long it was frozen. Phase-end
   alerts fire off elapsed-time _windows_, so even if four boundaries pass while
   the app is suspended, all four are reported, in order, on the next tick.
2. **Testability without a Mac.** The engine's suite runs on plain Node in about
   a second. A three-cycle run can be walked end to end with fabricated
   timestamps instead of waiting six and a half minutes.

An ESLint rule enforces the boundary — importing React or React Native under
`src/core` is an error, not a convention.

```
src/
├── core/                 Pure TS. No platform imports, no clock, no entropy.
│   ├── timer/            The interval engine
│   │   ├── types.ts      Domain types
│   │   ├── config.ts     Validation + normalisation at trust boundaries
│   │   ├── schedule.ts   Config -> timeline; phase lookup; boundary windows
│   │   ├── machine.ts    State transitions, projection, restore (all pure)
│   │   ├── runs.ts       Many timers: identity, list ops, shared alert budget
│   │   ├── alerts.ts     Timeline -> the notifications the OS should deliver
│   │   └── format.ts     Duration formatting/parsing
│   ├── reminders/        The scheduling mode: windows, weekdays, weekly slots
│   ├── oneoffs/          One note, one day, one time — then gone
│   ├── clock/            Weekdays and minutes of the day, shared by all three
│   └── alerts/           Vibration, alert sounds, and how the 64 slots split
├── features/
│   ├── timer/            Timer list, its hooks and its alert requests
│   ├── oneoffs/          Note composer and list
│   └── reminders/        Schedule screen, its hooks and its alert requests
├── services/
│   ├── notifications.ts  The only file that talks to expo-notifications
│   ├── soundPreview.ts   The only file that talks to expo-audio
│   └── storage.ts        The only file that talks to AsyncStorage
├── shell/TabShell.tsx    The three modes behind a bottom tab bar
├── components/           Shared UI (StepperRow, DayRow, TimeField,
│                         AlertRows, SwipeToDelete)
└── theme/tokens.ts       Colours, spacing, type scale
```

`assets/sounds/*.wav` are generated, not sourced — run
`python3 scripts/make-alert-sounds.py` to rebuild them. Synthesised tones have no
licence and nothing to declare at App Review.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository layout

| Path                                | What it is                                         |
| ----------------------------------- | -------------------------------------------------- |
| `app.config.ts`                     | Dynamic Expo config, env-driven, iOS-only          |
| `.github/workflows/ci.yml`          | Lint, typecheck, test, Expo config check           |
| `.github/workflows/ios-release.yml` | Archive, sign, upload to TestFlight                |
| `.github/workflows/security.yml`    | Secret scan, dependency audit, CodeQL, pin check   |
| `.github/scripts/`                  | Project-kind detection and Xcode target resolution |
| `docs/`                             | Architecture, deployment, security                 |
| `scripts/make-alert-sounds.py`      | Generates the bundled alert sounds                 |

## Security

The app makes **no network calls**, holds no keys and collects nothing. Your
timers, notes and schedule are stored in its own sandbox and never leave the
device. App Transport Security is fully enforced with no exception domains.

The App ID carries exactly one capability, Push Notifications, and the binary
one entitlement, `aps-environment`. Neither is used to push anything: they are
required because bundling custom alert sounds needs the `expo-notifications`
config plugin, which writes that entitlement. There is no APNs key, no device
token is ever requested, and no remote notification is sent or received. See
[SECURITY.md](SECURITY.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#alert-sounds-and-what-they-cost).

The pipeline is where the real security work is: SHA-pinned actions with a CI
check that enforces it, secrets passed via `env` rather than string
interpolation, ephemeral keychains torn down on every path, full-history secret
scanning, and least-privilege tokens throughout. See
[SECURITY.md](SECURITY.md) and the security model section of
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#security-model).

## Licence

MIT — see [LICENSE](LICENSE).
