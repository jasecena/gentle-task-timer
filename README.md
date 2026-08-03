# Gentle Task Timer

[![CI](https://github.com/jasecena/gentle-task-timer/actions/workflows/ci.yml/badge.svg)](https://github.com/jasecena/gentle-task-timer/actions/workflows/ci.yml)
[![Security](https://github.com/jasecena/gentle-task-timer/actions/workflows/security.yml/badge.svg)](https://github.com/jasecena/gentle-task-timer/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Two ways to be nudged, on iPhone.

**Timer** — a repeating interval run: a duration, a number of repeats and an
optional rest between cycles. It counts down and alerts you at every boundary.

**Schedule** — a standing arrangement: every 30 minutes, 09:00–17:00, weekdays.
Nothing counts down and nothing needs the app open.

Built and released entirely from Linux — no Mac at any point.

```
┌─────────────────────┐   ┌─────────────────────┐
│  Gentle Task Timer  │   │      Schedule       │
│ 7m total · 30s rest │   │  Every 30m, Mon–Fri │
│                     │   │                     │
│        WORK         │   │  Every        30m   │
│       01:47         │   │  From       09:00   │
│    Cycle 2 of 3     │   │  Until      17:00   │
│  ▓▓▓▓▓▓▓░░░░░░░░░░  │   │  Vibration     3s   │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░  │   │  S (M)(T)(W)(T)(F)S │
│                     │   │                     │
│   ┌─────────────┐   │   │  85 of 48 alerts/wk │
│   │    Pause    │   │   │  17 a day × 5 days  │
│   └─────────────┘   │   │                     │
│   ┌─────────────┐   │   │   ┌─────────────┐   │
│   │    Reset    │   │   │   │    Start    │   │
│   └─────────────┘   │   │   └─────────────┘   │
├─────────────────────┤   ├─────────────────────┤
│   ⏱ Timer   📅 Sched │   │  ⏱ Timer  📅 Sched  │
└─────────────────────┘   └─────────────────────┘
```

## Status

v0.1.0 is on TestFlight and installed. Current scope:

**Timer**

- [x] Named timer, work duration, repeat count, optional rest between cycles
- [x] Start / pause / resume / reset
- [x] Per-phase and whole-run progress
- [x] A run survives force-quitting the app, and comes back where it should be
- [x] Screen stays awake while running, releases when it stops
- [x] Correct across backgrounding, JS stalls and wall-clock changes

**Schedule**

- [x] Repeat every N minutes inside a window, on chosen weekdays
- [x] Keeps alerting with the app closed — weekly-repeating notifications, no
      background execution
- [x] Live alert count against the notification budget, with over-budget
      schedules refused rather than silently truncated
- [x] One-press stop

**Alerts, both modes**

- [x] Local notifications with sound, so boundaries reach you with the app
      closed or the screen locked
- [x] Vibration of a chosen length — off, 1s, 3s, 5s or 10s — with distinct
      rhythms per alert kind. Foreground only; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [ ] Custom alert sounds (needs the notifications config plugin, which pulls in
      a push entitlement — see `src/services/notifications.ts`)
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
npm test           # 194 tests, ~3s
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
├── core/                 Pure TS. No platform imports. 90%+ covered.
│   ├── timer/            The interval engine
│   │   ├── types.ts      Domain types
│   │   ├── config.ts     Validation + normalisation at trust boundaries
│   │   ├── schedule.ts   Config -> timeline; phase lookup; boundary windows
│   │   ├── machine.ts    State transitions, projection, restore (all pure)
│   │   ├── alerts.ts     Timeline -> the notifications the OS should deliver
│   │   └── format.ts     Duration formatting/parsing
│   ├── reminders/        The scheduling mode: windows, weekdays, weekly slots
│   └── alerts/           Vibration patterns + how the 64 slots are shared
├── features/
│   ├── timer/            Timer screen, its hooks and its alert requests
│   └── reminders/        Schedule screen, its hooks and its alert requests
├── services/
│   ├── notifications.ts  The only file that talks to expo-notifications
│   └── storage.ts        The only file that talks to AsyncStorage
├── shell/TabShell.tsx    The two modes behind a bottom tab bar
├── components/           Shared UI (StepperRow)
└── theme/tokens.ts       Colours, spacing, type scale
```

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

## Security

The app makes **no network calls**, holds no keys and collects nothing. Your
timer and schedule are stored in its own sandbox and never leave the device. App
Transport Security is fully enforced with no exception domains, and the App ID
carries **no capabilities or entitlements** — local notifications need none.

The pipeline is where the real security work is: SHA-pinned actions with a CI
check that enforces it, secrets passed via `env` rather than string
interpolation, ephemeral keychains torn down on every path, full-history secret
scanning, and least-privilege tokens throughout. See
[SECURITY.md](SECURITY.md) and the security model section of
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#security-model).

## Licence

MIT — see [LICENSE](LICENSE).
