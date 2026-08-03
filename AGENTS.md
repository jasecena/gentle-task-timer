# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project conventions

**iPhone only.** `platforms: ['ios']`. Do not add Android or web targets.

**`src/core` is pure TypeScript.** No React, React Native or Expo imports —
ESLint enforces this. The `core` Jest project compiles it with nothing but
`@babel/preset-typescript`, so any new dependency there breaks the suite. That
is intentional: it is how the engine stays testable on Linux with no simulator.

**Never accumulate elapsed time.** Derive it from wall-clock timestamps
(`accumulatedMs + (now - lastResumedAt)`). iOS suspends JS timers in the
background; a decrementing counter drifts and stops. Intervals exist only to
trigger repaints.

**Fire alerts off elapsed-time windows**, via `phasesEndingBetween(from, to]` —
not off a per-frame "did it hit zero?" check, which misses every boundary that
passes while the app is suspended.

**Run `npm run verify` before finishing.** Typecheck, lint, format check and 86
tests, in well under a minute.

**Never commit credentials.** `.gitignore` blocks the relevant patterns and
gitleaks scans history in CI, but the rule is simply: Apple credentials live
only in GitHub Secrets. See SECURITY.md.

**React 19 notes.** `act` is asynchronous — await it and `fireEvent` in tests.
Do not write refs during render or call `setState` synchronously in an effect
body; the lint rules catching both are errors, not warnings.

Architecture rationale: `docs/ARCHITECTURE.md`. Release pipeline:
`docs/DEPLOYMENT.md`.
