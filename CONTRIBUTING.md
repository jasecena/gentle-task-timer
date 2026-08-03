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
npm run verify     # typecheck + lint + format + 86 tests
```

CI runs the same thing, so if it passes locally it will pass there.

## Conventions worth knowing

**`src/core` is pure TypeScript.** No React, React Native or Expo imports — an
ESLint rule enforces it. This is what lets the timer engine be tested on Linux
with no simulator, and it is not negotiable.

**Never accumulate elapsed time.** Derive it from wall-clock timestamps. iOS
suspends JS timers in the background, so a decrementing counter drifts and
stops. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why this shapes
everything else.

**Engine changes need tests.** `src/core/timer` has a coverage gate (90%
branches, 100% functions) plus property-based tests in
`src/core/timer/__tests__/properties.test.ts`. If you add a behaviour, add the
invariant.

**Never commit credentials.** `.gitignore` blocks the relevant patterns, a
pre-commit hook runs gitleaks, and CI scans full history. Apple credentials
belong in GitHub Secrets only — see [SECURITY.md](SECURITY.md).

## Reporting a security issue

Please do not open a public issue. See [SECURITY.md](SECURITY.md).
