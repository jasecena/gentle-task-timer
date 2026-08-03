# Setup checklist (reusable template)

Resumable checklist for getting **any** iOS app onto TestFlight from a Linux
workstation, using the pipeline in `.github/workflows/ios-release.yml`.

Pick up at Phase 2 once Apple Developer Program enrolment is approved.

> For **this** app specifically, follow [GENTLE_TASK_TIMER_SETUP.md](GENTLE_TASK_TIMER_SETUP.md)
> instead — it is this template with the decisions already made. Keep this file
> generic so it can be copied into the next project.

Reference detail for every step, including troubleshooting:
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## Phase 1 — Apple account

- [ ] Create Apple ID
- [ ] Enable 2FA
- [ ] Join Apple Developer Program (US$99/yr; Individual enrolment is fastest —
      an Organization enrolment needs a D-U-N-S number and can take weeks)
- [ ] Verify account
- [ ] Record **Team ID** (10 chars, from Membership details)

---

## Phase 2 — Apple Developer Portal

- [ ] Create Bundle Identifier

```
com.yourcompany.yourapp
```

Must be globally unique and must match `IOS_BUNDLE_IDENTIFIER` exactly.

- [ ] Create App ID (Identifiers → **+** → App IDs → App → Explicit)

- [ ] Enable capabilities — **only the ones your app actually uses**

| Capability         | Enable when                                           |
| ------------------ | ----------------------------------------------------- |
| Background Modes   | Audio playback, location, or BLE while backgrounded   |
| Location           | You read the user's location                          |
| Push Notifications | **Remote** push, or bundled local-notification sounds |
| Associated Domains | Universal links / deep links                          |
| HealthKit, etc.    | The corresponding framework is used                   |

> Enable nothing speculatively. Unused entitlements draw App Review questions,
> require privacy-manifest justification, and on a public repository they are
> visible to anyone reading your config.
>
> **Local notifications need no capability at all** — that is the one people
> most often over-request. If your app only schedules its own alerts, you do not
> need Push Notifications.
>
> The exception, and it catches people out: bundling **custom sounds** for local
> notifications requires the `expo-notifications` config plugin, which writes an
> `aps-environment` entitlement. That entitlement does need the Push
> Notifications capability, even with no server and no remote push anywhere in
> the app. This project made that trade in v0.3; see
> [GENTLE_TASK_TIMER_SETUP.md](GENTLE_TASK_TIMER_SETUP.md).

- [ ] Certificates and provisioning profiles — **skip**

The workflow passes `-allowProvisioningUpdates` with the API key, so Xcode
creates and downloads these on the runner (cloud managed signing). Only create
them by hand if your team mandates a specific certificate; see
[DEPLOYMENT.md](DEPLOYMENT.md#certificates-and-provisioning-profiles).

---

## Phase 3 — App Store Connect

- [ ] Create App Store Connect access

- [ ] Create new app record — **before the first upload**, or the upload fails
      with "no suitable application record was found"

Information needed:

- App name
- Bundle ID (from Phase 2)
- SKU (any unique string)
- Primary language

- [ ] Create API Key — Users and Access → Integrations → App Store Connect API
      → Team Keys, role **App Manager**

Save:

```
Issuer ID     (UUID, team-wide — top of the Keys page, NOT the key id)
Key ID        (10 chars)
.p8 private key   (downloadable exactly once)
```

> Mixing up Issuer ID and Key ID is the single most common cause of a 401 on the
> first run.

---

## Phase 4 — GitHub repository

- [ ] Create repository

- [ ] Add repository **variables** (Settings → Secrets and variables → Actions →
      Variables). Not secret; they appear in logs. **The workflow aborts without
      these.**

```
IOS_BUNDLE_IDENTIFIER     com.yourcompany.yourapp
APPLE_TEAM_ID             A1B2C3D4E5
```

- [ ] Add repository **secrets**

```
APP_STORE_CONNECT_KEY_ID
APP_STORE_CONNECT_ISSUER_ID
APP_STORE_CONNECT_PRIVATE_KEY    (entire .p8 including BEGIN/END lines)
```

- [ ] Create the `ios-release` **environment** (Settings → Environments)
  - [ ] Move the three `APP_STORE_CONNECT_*` secrets into it (tighter scoping)
  - [ ] Restrict deployment branches and tags to `v*`
  - [ ] Add yourself as a required reviewer, and turn admin bypass off
  - [ ] Allow a branch (e.g. `main`) only for the first dry run, then remove it.
        A pre-release tag such as `v0.1.1-rc1` matches the `v*` rule, so later
        dry runs need no branch rule

- [ ] Confirm Settings → Actions → General → **Fork pull request workflows** is
      at the default (require approval for first-time contributors)

- [ ] Delete your local copy of the `.p8` once it is in GitHub

---

## Phase 5 — Project preparation

- [ ] Set the bundle identifier

Where this lives depends on the project kind — the workflow auto-detects all
four:

| Project kind        | Configure in                             |
| ------------------- | ---------------------------------------- |
| Native Xcode        | Target → Signing & Capabilities          |
| **Expo**            | `app.config.ts` (`ios.bundleIdentifier`) |
| React Native (bare) | `ios/` project settings                  |
| Flutter             | `ios/Runner.xcodeproj`                   |

> For Expo and Flutter, `ios/` is **generated** — do not hand-edit it, the next
> prebuild discards your changes. Edit the config file instead.

- [ ] Configure entitlements — matching Phase 2, nothing more

```
Background Modes
 └── Audio          (only if you play audio while backgrounded)
```

- [ ] Add privacy usage descriptions for every framework you touch

```
NSLocationAlwaysAndWhenInUseUsageDescription    (only if using location)
NSMicrophoneUsageDescription                     (only if recording audio)
```

> An app that declares a usage description it never needs still has to justify
> it to App Review. Add them as you add the features, not upfront.

- [ ] App icon: 1024×1024 PNG, **no alpha channel**, no rounded corners

---

## Phase 6 — CI/CD

- [ ] Add `.github/workflows/ios-release.yml`

- [ ] Run the workflow manually with **submit_to_testflight unchecked** first —
      proves signing works without committing an upload

- [ ] Fix signing issues
      ([troubleshooting](DEPLOYMENT.md#troubleshooting))

- [ ] Re-run with upload enabled → first TestFlight build

- [ ] Decide on the simulator smoke test (`ENABLE_SMOKE_TEST` variable). Off by
      default; costs ~10 min of macOS runner time, and is the only check that
      catches a crash on launch

---

## Phase 7 — Device testing

- [ ] Install TestFlight on iPhone
- [ ] Add yourself as an internal tester (no Apple review needed, up to 100)
- [ ] Accept tester invitation
- [ ] Test, covering only what your app actually does:
  - [ ] Core happy path
  - [ ] Backgrounding and returning after a long interval
  - [ ] Notifications firing when the app is not in the foreground
  - [ ] Battery behaviour over a realistic session
  - [ ] Offline behaviour / airplane mode
  - [ ] Background audio, GPS, BLE — **only if the app uses them**

---

## Public vs private repository

The Apple half of this checklist is unaffected by repository visibility. Phases
4 and 6 change.

|                        | Private                           | Public                    |
| ---------------------- | --------------------------------- | ------------------------- |
| GitHub Actions minutes | Billed; macOS ~10× Linux          | **Free**, including macOS |
| Build artifacts        | Collaborators only                | **World-downloadable**    |
| Secret scanning        | Paid add-on                       | **Free**                  |
| CodeQL / code scanning | Requires GitHub Advanced Security | **Free**                  |
| Secrets in fork PRs    | Not exposed                       | Not exposed               |

If you go public:

- [ ] Remove `*.ipa` from the artifact `path:` in `ios-release.yml` — the signed
      binary would otherwise be downloadable by anyone. dSYMs and logs are the
      useful debugging output and are fine to keep.
- [ ] Enable secret scanning **and push protection** (free, and a genuine
      upgrade over relying on the gitleaks job alone)
- [ ] Re-check the `ios-release` environment restrictions above — they are what
      keep Apple credentials away from fork PRs
- [ ] Consider enabling the smoke test, now that macOS minutes are free
- [ ] Note that CodeQL results become visible in the public Security tab

> On a **private** repo the `codeql` job in `security.yml` will fail at the
> upload step unless you have GitHub Advanced Security. Either go public, buy
> GHAS, or delete that job.
