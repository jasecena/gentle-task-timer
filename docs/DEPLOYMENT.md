# Deployment

How a signed build gets from this Linux machine onto an iPhone, with no Mac
anywhere in the loop.

- [The short version](#the-short-version)
- [Choosing a path](#choosing-a-path)
- [1. Apple Developer Program enrolment](#1-apple-developer-program-enrolment)
- [2. App Store Connect setup](#2-app-store-connect-setup)
- [3. Apple Developer portal setup](#3-apple-developer-portal-setup)
- [4. GitHub repository setup](#4-github-repository-setup)
- [5. Running a release](#5-running-a-release)
- [6. Installing on your iPhone](#6-installing-on-your-iphone)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Free alternatives to the US$99 membership](#free-alternatives-to-the-us99-membership)

---

## The short version

```
git tag v0.1.0 && git push origin v0.1.0
        │
        ├─ CI verifies on Linux (lint, types, 86 tests)   ~40s
        │
        └─ GitHub-hosted macOS runner:
             expo prebuild → pod install
             xcodebuild archive   (signs via App Store Connect API key)
             validate archive
             xcodebuild -exportArchive → App.ipa
             altool --validate-app
             altool --upload-app  → TestFlight
        │
        └─ TestFlight app on your iPhone → Install
```

You never touch Xcode. You never hold a certificate. The only thing you own is
an API key that lives in GitHub Secrets.

---

## Choosing a path

|                                  | Expo Go                  | TestFlight (this pipeline) | SideStore                  |
| -------------------------------- | ------------------------ | -------------------------- | -------------------------- |
| Cost                             | Free                     | **US$99/yr**               | Free                       |
| Standalone app                   | No — runs inside Expo Go | Yes                        | Yes                        |
| Custom icon & name               | No                       | Yes                        | Yes                        |
| Expiry                           | None                     | 90 days per build          | **7 days**, auto-refreshed |
| Background audio / notifications | Limited                  | Full                       | Full                       |
| Push notifications               | Limited                  | Yes                        | No                         |
| Setup effort                     | Minutes                  | An hour, once              | Fiddly                     |

**Recommendation:** develop against Expo Go (free, instant reload, no account),
and stand this pipeline up when you want the real app on your phone. This
project is structured so that choice changes nothing about the source.

> A repeating timer needs _local_ notifications, not push — so SideStore's
> lack of push is not disqualifying for this app. The 7-day re-signing is the
> real friction.

---

## 1. Apple Developer Program enrolment

1. Go to <https://developer.apple.com/programs/enroll/>.
2. Enrol as an **Individual** (fastest — a company enrolment needs a D-U-N-S
   number and takes weeks).
3. Pay US$99 / A$149 per year.
4. Wait for approval — usually a few hours, occasionally 48 hours.

Note your **Team ID**: <https://developer.apple.com/account> → Membership
details. It is a 10-character string like `A1B2C3D4E5`.

---

## 2. App Store Connect setup

### 2a. Create the App Store Connect API key

This is what lets CI sign and upload without a human present.

1. <https://appstoreconnect.apple.com> → **Users and Access** → **Integrations**
   → **App Store Connect API** → **Team Keys**.
2. Click **+**, name it `github-actions-ci`.
3. Access role: **App Manager**. (**Developer** cannot upload builds;
   **Admin** is more authority than a CI job should hold.)
4. **Download the `.p8` file.** Apple lets you download it exactly once. If you
   lose it, revoke the key and make a new one.
5. Record the **Key ID** (10 chars) and the **Issuer ID** (a UUID, shown at the
   top of the Keys page — it is per-team, not per-key).

> Treat the `.p8` like a password. Anyone holding it can upload builds as you.
> Delete your local copy once it is in GitHub Secrets — `.gitignore` blocks
> `*.p8`, but the safest copy is the one that does not exist.

### 2b. Register the app record

1. App Store Connect → **Apps** → **+** → **New App**.
2. Platform **iOS**; pick your bundle ID (created in step 3); SKU can be
   anything unique (`gentle-task-timer`); primary language as you like.

You must create the app record _before_ the first upload, or `altool` rejects
the build with "no suitable application record was found".

---

## 3. Apple Developer portal setup

### Register the App ID

1. <https://developer.apple.com/account/resources/identifiers/list> → **+**.
2. **App IDs** → **App**.
3. Bundle ID: **Explicit**, e.g. `com.yourname.gentletasktimer`. It must be globally
   unique and must match `vars.IOS_BUNDLE_IDENTIFIER` exactly.
4. Capabilities: leave everything off for now. This app is fully offline. Add
   **Push Notifications** only if you later add remote notifications — local
   notifications need no capability.

### Certificates and provisioning profiles

**You do not need to create these by hand.** The workflow passes
`-allowProvisioningUpdates` together with the API key, so Xcode creates and
downloads the distribution certificate and provisioning profile on the runner
(Apple calls this _cloud managed signing_).

Only if your team requires a specific pre-existing certificate, set the optional
secrets `IOS_DIST_CERT_P12_BASE64` and `IOS_DIST_CERT_PASSWORD`; the workflow
imports them into a throwaway keychain instead.

> Apple caps you at **3 distribution certificates** per team. Cloud managed
> signing reuses one rather than minting a new one per build, but if you hit the
> cap, revoke unused certificates in the portal.

---

## 4. GitHub repository setup

### Repository variables

**Settings → Secrets and variables → Actions → Variables → New variable.**
These are not secret; they appear in build logs.

| Variable                | Example                        | Where it comes from |
| ----------------------- | ------------------------------ | ------------------- |
| `IOS_BUNDLE_IDENTIFIER` | `com.yourname.gentletasktimer` | Step 3              |
| `APPLE_TEAM_ID`         | `A1B2C3D4E5`                   | Step 1              |

### Repository secrets

**Settings → Secrets and variables → Actions → Secrets → New secret.**

| Secret                          | What to paste                         | Where it comes from |
| ------------------------------- | ------------------------------------- | ------------------- |
| `APP_STORE_CONNECT_KEY_ID`      | 10-char key id, e.g. `2X9ABC3DEF`     | Step 2a             |
| `APP_STORE_CONNECT_ISSUER_ID`   | UUID, e.g. `69a6de70-…-1f2c3d4e5f6a`  | Step 2a             |
| `APP_STORE_CONNECT_PRIVATE_KEY` | **Entire contents** of the `.p8` file | Step 2a             |

For the private key, paste the whole file including the delimiter lines:

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----
```

The easiest way to get it exactly right:

```bash
# Copies the file verbatim to your clipboard; paste straight into GitHub.
xclip -selection clipboard < AuthKey_2X9ABC3DEF.p8   # Linux/X11
wl-copy < AuthKey_2X9ABC3DEF.p8                      # Linux/Wayland
```

Optional, only for explicit-certificate signing:

| Secret                     | What to paste                                  |
| -------------------------- | ---------------------------------------------- |
| `IOS_DIST_CERT_P12_BASE64` | `base64 -w0 dist.p12`                          |
| `IOS_DIST_CERT_PASSWORD`   | The password you set when exporting the `.p12` |

### Protect the release environment

The release job runs in an environment named `ios-release`, which is what keeps
the Apple credentials out of reach of pull requests from forks.

1. **Settings → Environments → New environment** → `ios-release`.
2. Add the three `APP_STORE_CONNECT_*` secrets _to the environment_ rather than
   to the repository, if you want them scoped as tightly as possible.
3. Optionally add yourself as a **required reviewer**, so a release pauses for
   approval before anything reaches Apple.
4. Restrict **deployment branches and tags** to `v*` tags.

---

## 5. Running a release

### By tag (the normal path)

```bash
git tag v0.1.0
git push origin v0.1.0
```

The marketing version comes from the tag (`v0.1.0` → `0.1.0`). The build number
comes from the workflow run number, which is monotonic — so every upload has a
unique, increasing `CFBundleVersion`, which App Store Connect requires.

### Manually

**Actions → iOS Release → Run workflow.** Options:

- **submit_to_testflight** — uncheck to produce a signed IPA artifact without
  uploading. Useful for verifying signing works before committing to an upload.
- **scheme** — override scheme auto-detection.
- **xcode_version** — pin a major version, e.g. `16`.
- **skip_verify** — skip lint/tests. Emergencies only.

### The optional smoke test

**Off by default.** When enabled, a `smoke` job builds the app for the iOS
Simulator and drives the real binary with [Maestro](https://maestro.dev)
(`.maestro/smoke.yaml`) — launch, start, confirm the clock actually ticks,
pause, reset. If it fails, the upload does not happen.

This is the only check that can tell you the app crashes on launch. Jest never
runs the real bundle, so a broken native module, a missing asset or a bad
`Info.plist` is invisible to it.

Enable it either way:

- **Per run** — tick **run_smoke_test** when dispatching manually.
- **Always** — set the repository _variable_ `ENABLE_SMOKE_TEST` to `true`.
  Needed for tag pushes, where workflow inputs do not exist.

Cost is roughly 10 extra minutes of macOS runner time, which is why it is
opt-in. The job holds no Apple credentials — it has no `environment:` binding
and builds unsigned for the simulator, so it needs none.

The flow's assertions are tied to `INITIAL_CONFIG` in `TimerScreen.tsx`
(2-minute work phase, 3 repeats). Change those defaults and the flow must change
with them.

### What you get

- A build in TestFlight after Apple finishes processing (5–30 minutes).
- An `ios-build-<n>` artifact holding the IPA, dSYMs and build logs, kept 14
  days.

### If you make the repository public

GitHub Actions minutes — including macOS — are free on public repositories,
which is a real saving given macOS bills at ~10× Linux. Two things change:

1. **Build artifacts become world-readable.** Anyone can download the signed
   IPA and dSYMs from a run. Drop `*.ipa` from the "Upload build artifacts"
   step's `path:` if that bothers you; the logs and dSYMs are the useful part
   for debugging anyway.
2. **Secrets stay safe, but verify the guardrails.** Secrets are never exposed
   to workflows triggered by a fork's pull request, and the `ios-release`
   environment adds a second lock. Confirm **Settings → Actions → General →
   Fork pull request workflows** is left at the default (require approval for
   first-time contributors), and keep the environment's deployment branch rule
   restricted to `v*` tags.

---

## 6. Installing on your iPhone

1. Install **TestFlight** from the App Store.
2. Sign in with the Apple ID that owns the developer account.
3. App Store Connect → your app → **TestFlight** → **Internal Testing** → add
   yourself as a tester.
4. The build appears in TestFlight on your phone. Tap **Install**.

Internal testing needs no Apple review and allows up to 100 testers. Each build
is installable for 90 days.

---

## Security model

What this pipeline does, and why.

**Credentials never exist in the repository.** `.gitignore` blocks `*.p8`,
`*.p12`, `*.mobileprovision`, `.env` and friends. Gitleaks scans the full commit
history on every PR and weekly, so a key committed and later deleted is still
caught — because it is still in the git objects, and still compromised.

**Secrets reach the runner through `env`, never through string interpolation.**
`${{ secrets.X }}` pasted into a `run:` block becomes part of the script text,
where a quote or backtick in the value could break parsing or be evaluated. Every
step here binds secrets to environment variables instead.

**Nothing is echoed.** Steps handling key material use `set +x`, write files
under `umask 077`, and `chmod 600`. The generated keychain password is passed
through `::add-mask::` before it can reach a log.

**The keychain is ephemeral.** A dedicated keychain is created in `$RUNNER_TEMP`,
auto-locks after an hour, and is deleted in an `if: always()` teardown step
alongside the `.p8` and any `.p12`. GitHub-hosted runners are disposable, but
this workflow is written to be safe on a self-hosted runner too.

**Least privilege throughout.** `permissions: contents: read` at the workflow
level; `security-events: write` granted only to the CodeQL job. The API key is
scoped **App Manager**, not Admin. The release job is bound to a protected
environment, so a fork PR cannot reach the credentials.

**The supply chain is pinned.** Every action is pinned to a full 40-character
commit SHA, not a mutable tag — and a CI job fails the build if anyone adds one
that is not. Dependabot keeps those pins current, because pinning without
updating just means never getting security fixes.

**No third-party actions touch credentials.** Xcode selection is done with
`xcode-select` directly rather than via a community action, keeping the signing
path free of third-party code.

**The app itself has no attack surface worth the name.** It makes no network
calls, holds no API keys, collects nothing, and ships with App Transport
Security fully enforced and no exception domains.

---

## Troubleshooting

### `No signing certificate "iOS Distribution" found`

Cloud managed signing could not create or fetch a certificate.

- Confirm the API key role is **App Manager**, not Developer.
- Check you are not at Apple's 3-distribution-certificate cap:
  <https://developer.apple.com/account/resources/certificates/list>. Revoke
  unused ones.
- Confirm `APPLE_TEAM_ID` matches the team that owns the key.

### `error: No profiles for 'com.x.y' were found`

The App ID is not registered, or the bundle identifier does not match.

- The identifier in **Certificates, Identifiers & Profiles → Identifiers** must
  equal `vars.IOS_BUNDLE_IDENTIFIER` **exactly** — case sensitive, no typos.
- `-allowProvisioningUpdates` can create a profile but **cannot create the App
  ID**. Register it first (step 3).

### `Authentication credentials are missing or invalid` (401)

- `APP_STORE_CONNECT_ISSUER_ID` is the **team-wide** issuer id from the top of
  the Keys page, not the key id. Mixing these two up is the single most common
  failure.
- Re-paste `APP_STORE_CONNECT_PRIVATE_KEY` — it must include the
  `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. The
  workflow's "Install App Store Connect API key" step checks for this and fails
  early with a clear message.
- Confirm the key has not been revoked.

### `No suitable application record was found`

Create the app record in App Store Connect first (step 2b). The bundle ID there
must match the build's.

### `The bundle version must be higher than the previously uploaded version`

An earlier upload used the same `CFBundleVersion`. The workflow uses
`github.run_number`, which only increases — so this normally means you uploaded
that build number by another route. Re-run the workflow to get a fresh number.

### `Invalid Bundle. The bundle at 'App.app' does not contain a valid CFBundleIcon`

An icon is missing or the wrong size. `assets/icon.png` must be **1024×1024**,
PNG, **no alpha channel**, no rounded corners.

```bash
# Check what you have:
file assets/icon.png
# Strip alpha if needed:
convert assets/icon.png -background white -alpha remove -alpha off assets/icon.png
```

### `xcodebuild: error: Unable to find a destination matching 'generic/platform=iOS'`

Usually the wrong scheme. Check the workflow log for the "Available schemes"
line printed by `resolve-xcode-target.sh`, then re-run with the **scheme** input
set explicitly.

### `Command PhaseScriptExecution failed` during archive

Almost always a JS bundling failure surfacing as a native build error. Look
further up the log for the Metro output. Reproduce locally with:

```bash
npx expo export --platform ios
```

### The build hangs at the signing step

A codesign keychain prompt with nobody to answer it. The workflow calls
`security set-key-partition-list` after importing a `.p12` specifically to
prevent this — if you have customised the import step, that call is why it is
there.

### `ExportOptions` / `method` errors on older Xcode

The workflow uses `app-store-connect`, correct for Xcode 15.3+. On older Xcode,
change it to `app-store` in the "Export signed IPA" step.

### Reading the logs

Every run uploads an `ios-build-<n>` artifact containing `archive.log` and
`export.log` even when the run failed — that is where the real error usually is,
rather than in the summarised step output.

---

## Free alternatives to the US$99 membership

Genuine, with real tradeoffs.

### Expo Go — free, zero setup, best for development

```bash
npm start          # scan the QR code with your iPhone camera
```

Install Expo Go from the App Store first. Hot reload from this Linux box to your
phone. Limitation: your code runs inside Expo Go's container, so no custom icon,
no standalone app, and background audio modes cannot be tested.

### SideStore — free, a real standalone app

Sign an IPA with a free Apple ID and install it. After a one-time pairing from a
computer, it re-signs itself over a local WireGuard VPN, so the 7-day expiry is
handled automatically.

Constraints: 3 apps at a time, ~10 new App IDs per week, no push notifications
(local notifications work), and you still need somewhere to produce an unsigned
IPA — a cloud macOS builder configured for unsigned output.

Docs: <https://docs.sidestore.io>

### What is _not_ possible without a Mac or a paid account

Signing an IPA for a physical device purely locally on Linux. Free provisioning
requires Xcode. Every free route above works by borrowing Apple's signing
service through a tool that has implemented Xcode's authentication protocol.
