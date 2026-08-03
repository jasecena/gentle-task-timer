# Life Timer

<!-- Replace jasecena/life-timer with your GitHub path once the repository exists.
     Step 3 of docs/LIFE_TIMER_SETUP.md has a one-line sed command for this. -->

[![CI](https://github.com/jasecena/life-timer/actions/workflows/ci.yml/badge.svg)](https://github.com/jasecena/life-timer/actions/workflows/ci.yml)
[![Security](https://github.com/jasecena/life-timer/actions/workflows/security.yml/badge.svg)](https://github.com/jasecena/life-timer/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A repeating interval timer for iPhone. Set a duration, a number of repeats and
an optional rest between cycles; it counts down and alerts you at every
boundary.

Built and released entirely from Linux — no Mac at any point.

```
┌─────────────────────┐
│      Life Timer     │
│   7m total · 30s rest│
│                     │
│        WORK         │
│       01:47         │
│    Cycle 2 of 3     │
│  ▓▓▓▓▓▓▓░░░░░░░░░░  │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░  │
│                     │
│   ┌─────────────┐   │
│   │    Pause    │   │
│   └─────────────┘   │
│   ┌─────────────┐   │
│   │    Reset    │   │
│   └─────────────┘   │
└─────────────────────┘
```

## Status

v0.1 — the core is done and tested. Current scope:

- [x] Named timer, work duration, repeat count, optional rest between cycles
- [x] Start / pause / resume / reset
- [x] Per-phase and whole-run progress
- [x] Vibration alerts, distinct per phase kind
- [x] Screen stays awake while running, releases when it stops
- [x] Correct across backgrounding, JS stalls and wall-clock changes
- [ ] Alert sounds
- [ ] Local notifications (alerts when the app is not in the foreground)
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
npm test           # 86 tests, ~3s
npm run test:watch
```

## Getting it onto your phone as a real app

Follow **[docs/LIFE_TIMER_SETUP.md](docs/LIFE_TIMER_SETUP.md)** — the concrete
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
├── core/timer/           Pure TS engine. No platform imports. 90%+ covered.
│   ├── types.ts          Domain types
│   ├── config.ts         Validation + normalisation at trust boundaries
│   ├── schedule.ts       Config -> timeline; phase lookup; boundary windows
│   ├── machine.ts        State transitions + projection (all pure functions)
│   └── format.ts         Duration formatting/parsing
├── features/timer/       React layer
│   ├── TimerScreen.tsx
│   ├── components/       Presentational, driven entirely by the projection
│   └── hooks/            useTimer binds the engine to React; keep-awake
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

The app makes **no network calls**, holds no keys and collects nothing. App
Transport Security is fully enforced with no exception domains.

The pipeline is where the real security work is: SHA-pinned actions with a CI
check that enforces it, secrets passed via `env` rather than string
interpolation, ephemeral keychains torn down on every path, full-history secret
scanning, and least-privilege tokens throughout. See
[SECURITY.md](SECURITY.md) and the security model section of
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#security-model).

## Licence

MIT — see [LICENSE](LICENSE).
