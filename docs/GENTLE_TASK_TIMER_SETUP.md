# Gentle Task Timer — setup steps

Reference and troubleshooting: [DEPLOYMENT.md](DEPLOYMENT.md).
Generic template for the next project: [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md).

Repository visibility: **public**.

**Remaining before a release can succeed:**

1. Dry run with `submit_to_testflight` unchecked (Phase 6), then the real
   upload.

Everything else is in place. The release job now refuses to start on a
placeholder or a malformed identifier, so a misconfigured credential fails in
seconds rather than after the archive step.

---

## Phase 0 — Local

- [x] Set your git identity — commits author as the GitHub noreply address
- [x] Confirm `LICENSE` credits you — `Copyright (c) 2026 Jason`
- [x] Set your bundle identifier in `.env` (gitignored)
- [x] Replace `assets/icon.png` (1024×1024, RGB, no alpha) — progress ring in
      the app's own palette. `assets/splash-icon.png` matches it
- [x] Verify — `npm run verify` green, 86 tests, `expo-doctor` 20/20

---

## Phase 1 — Apple account

- [x] Apple ID with 2FA
- [x] Apple Developer Program enrolment
- [x] Team ID recorded in `.env` as `APPLE_TEAM_ID`

---

## Phase 2 — Developer portal

- [x] <https://developer.apple.com/account/resources/identifiers/list> → **+** →
      App IDs → App → **Explicit**:

```
com.<yourname>.lifetimer
```

- [x] Capabilities: enable nothing.

---

## Phase 3 — App Store Connect

- [x] Apps → **+** → New App:

```
Platform:          iOS
Name:              Gentle Task Timer
Bundle ID:         from Phase 2
SKU:               gentle-task-timer
Primary language:  English (Australia)
```

SKU and Bundle ID are permanent. Everything else is editable later.

- [x] Users and Access → Integrations → App Store Connect API → Team Keys → **+**:

```
Name:  github-actions-ci
Role:  App Manager
```

- [x] Download the `.p8` (one download only) and record the **Key ID**
      (10 characters) and the **Issuer ID** (UUID, from the top of the Keys page).

---

## Phase 4 — GitHub

- [x] Repository created and pushed
- [x] README badges pointing at the repository

Order matters: the environment must exist before the secrets go in. Secrets are
write-only — once the `.p8` is deleted there is no way to read a stored secret
back out and re-add it elsewhere.

- [x] Settings → Secrets and variables → Actions → **Variables**. Repository
      level, not environment — the smoke job has no `environment:` binding and
      cannot read environment-scoped variables:

```
IOS_BUNDLE_IDENTIFIER    com.<yourname>.lifetimer
APPLE_TEAM_ID            (value from .env)
```

- [x] Settings → Environments → New → **`ios-release`**
  - [x] Deployment branches and tags → Selected → add rule `v*`

> `main` is also permitted, which is what lets the Phase 6 dry run reach the
> credentials via **Run workflow**. Remove it once releases are tag-driven.

- [x] `ios-release` → **Environment secrets** → Add secret, three times:

```
APP_STORE_CONNECT_KEY_ID         10-char key id (it is in the .p8 filename)
APP_STORE_CONNECT_ISSUER_ID      the UUID
APP_STORE_CONNECT_PRIVATE_KEY    whole .p8, BEGIN/END lines included
```

Or from the CLI, which cannot mangle the key's newlines:

```bash
gh secret set APP_STORE_CONNECT_KEY_ID      --env ios-release --body '<key id>'
gh secret set APP_STORE_CONNECT_ISSUER_ID   --env ios-release --body '<issuer uuid>'
gh secret set APP_STORE_CONNECT_PRIVATE_KEY --env ios-release < AuthKey_XXXXXXXXXX.p8
```

- [x] Confirm three are listed, and that none leaked to repository level:

```bash
gh secret list --env ios-release
gh secret list
```

- [ ] Only now, delete the local `.p8`:

```bash
shred -u AuthKey_XXXXXXXXXX.p8
```

- [x] Settings → Actions → General → Fork pull request workflows → confirm
      "Require approval for first-time contributors".

- [x] Settings → Code security → enable **Secret scanning** and **Push protection**.

- [x] Add repository description and topics (`ios`, `react-native`, `expo`,
      `github-actions`, `testflight`).

- [x] Branch protection on `main` — pull request required, 6 required status
      checks (including `CodeQL`), up-to-date branches, force push and deletion
      blocked, **enforced for admins**. Relax in an emergency with:

```bash
gh api -X DELETE repos/:owner/:repo/branches/main/protection/enforce_admins
```

- [x] `.github/CODEOWNERS` — every path owned by `@jasecena`. "Require review
      from Code Owners" stays **off**: a code owner cannot approve their own
      pull request, so enabling it on a solo repository blocks every merge.

---

## Phase 5 — Project

- [x] `.env` created locally
- [x] `IOS_BUNDLE_IDENTIFIER` in `.env` matches the repository variable
- [x] Real app icon in place

---

## Phase 6 — CI/CD

- [x] Confirm CI is green on the first push (Actions tab).

- [ ] Actions → iOS Release → Run workflow, **submit_to_testflight UNCHECKED**.

- [ ] Re-run with **submit_to_testflight CHECKED**.

- [ ] Switch to tag-driven releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] Optional: set repository variable `ENABLE_SMOKE_TEST=true`.

---

## Phase 7 — Device testing

- [x] Install TestFlight on your iPhone.
- [ ] App Store Connect → Gentle Task Timer → TestFlight → Internal Testing →
      add yourself, accept the invite, install.
- [ ] Start a 2-minute timer; confirm it counts down correctly.
- [ ] Pause, wait a minute, resume — elapsed time must exclude the pause.
- [ ] Background the app mid-run for 5+ minutes, reopen — must show the correct
      phase and remaining time.
- [ ] Lock the screen mid-run, reopen — same expectation.
- [ ] Screen stays awake while running, sleeps when paused or idle.
- [ ] Airplane mode: identical behaviour.
- [ ] Battery over a 30-minute session.

v0.1 alerts are vibration only, foreground only.
