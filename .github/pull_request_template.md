## What changed

<!-- One or two sentences. What does this do, and why? -->

## Checklist

- [ ] `npm run verify` passes (typecheck, lint, format, tests)
- [ ] Engine changes (`src/core`) come with tests, including an invariant in
      `properties.test.ts` where one applies
- [ ] No credentials, Team IDs, bundle identifiers or other account-specific
      values added to committed files
- [ ] `src/core` still imports nothing from React, React Native or Expo

## Timing behaviour

<!-- Delete if this PR does not touch the timer engine.

     If it does, confirm the change holds up under:
     - backgrounding the app mid-run for several minutes
     - pausing and resuming repeatedly
     - the device clock jumping backwards -->
