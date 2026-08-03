# Contributing

This is a personal project, published mainly so the build pipeline is useful to
other people trying to ship an iOS app without owning a Mac. Issues and pull
requests are welcome, but there is no service commitment and features outside
the roadmap in the [README](README.md) may not be merged.

If the CI/CD setup is the part you are here for, the interesting files are
[`.github/workflows/ios-release.yml`](.github/workflows/ios-release.yml) and
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Copy them freely — MIT licensed.

## Getting set up

```bash
npm install
npm start          # scan the QR code with Expo Go on an iPhone
```

No Apple Developer account or Mac is needed to run or test the app. Everything
except the release build works on Linux.

## Before opening a pull request

```bash
npm run verify     # typecheck + lint + format + 194 tests
```

CI runs the same thing, so if it passes locally it will pass there.

## Conventions worth knowing

**`src/core` is pure TypeScript.** No React, React Native or Expo imports — an
ESLint rule enforces it. This is what lets the engine be tested on Linux with no
simulator, and it is not negotiable. Three domains live there: `timer` (a run
you start), `reminders` (a standing schedule) and `alerts` (vibration patterns
and the notification budget).

**Never accumulate elapsed time.** Derive it from wall-clock timestamps. iOS
suspends JS timers in the background, so a decrementing counter drifts and
stops. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why this shapes
everything else.

**Native modules live behind `src/services`.** `notifications.ts` and
`storage.ts` are the only files that import `expo-notifications` and
AsyncStorage. Everything read back out of storage is treated as untrusted input
and passed through a `normalize*` function.

**Notifications are tagged, and cancelled by tag.** The timer and the schedule
share one pool of 64 pending notifications, so
`cancelAllScheduledNotificationsAsync` would let one feature silently wipe the
other's alerts. Use the helpers in `src/services/notifications.ts`.

**Engine changes need tests.** Each core domain has a coverage gate (90%
branches, 100% functions), plus property-based tests in
`src/core/timer/__tests__/properties.test.ts`. If you add a behaviour, add the
invariant.

The platform constraints that shaped the current design — the 64-notification
ceiling, why a long vibration only works in the foreground, why there is no
notifications config plugin — are listed under "Settled decisions" in
[AGENTS.md](AGENTS.md). Read those before changing how alerts work.

**Never commit credentials.** `.gitignore` blocks the relevant patterns, a
pre-commit hook runs gitleaks, and CI scans full history. Apple credentials
belong in GitHub Secrets only — see [SECURITY.md](SECURITY.md).

## Reporting a security issue

Please do not open a public issue. See [SECURITY.md](SECURITY.md).
