# Gentle Task Timer — setup steps

Reference and troubleshooting: [DEPLOYMENT.md](DEPLOYMENT.md).
Generic template for the next project: [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md).

Repository visibility: **public**.

---

## Phase 0 — Local

- [ ] Set your git identity:

```bash
git config user.name  "Your Name"
git config user.email "<id>+<username>@users.noreply.github.com"
```

- [ ] Confirm `LICENSE` credits you.

- [ ] Set your bundle identifier in `.env` (gitignored):

```bash
IOS_BUNDLE_IDENTIFIER=com.<yourname>.gentletasktimer
```

- [ ] Replace `assets/icon.png` (1024×1024, RGB, no alpha).

- [ ] Verify:

```bash
npm run verify
git status --short
git check-ignore -v .env
```

---

## Phase 1 — Apple account

- [x] Apple ID with 2FA
- [x] Apple Developer Program enrolment
- [x] Team ID recorded in `.env` as `APPLE_TEAM_ID`

---

## Phase 2 — Developer portal

- [ ] <https://developer.apple.com/account/resources/identifiers/list> → **+** →
      App IDs → App → **Explicit**:

```
com.<yourname>.gentletasktimer
```

- [ ] Capabilities: enable nothing.

---

## Phase 3 — App Store Connect

- [ ] Apps → **+** → New App:

```
Platform:          iOS
Name:              Gentle Task Timer
Bundle ID:         from Phase 2
SKU:               gentle-task-timer
Primary language:  English (Australia)
```

SKU and Bundle ID are permanent. Everything else is editable later.

- [ ] Users and Access → Integrations → App Store Connect API → Team Keys → **+**:

```
Name:  github-actions-ci
Role:  App Manager
```

- [ ] Download the `.p8` (one download only) and record the **Key ID**
      (10 characters) and the **Issuer ID** (UUID, from the top of the Keys page).

---

## Phase 4 — GitHub

- [x] Repository created and pushed
- [x] README badges pointing at the repository

Order matters: the environment must exist before the secrets go in. Secrets are
write-only — once the `.p8` is deleted there is no way to read a stored secret
back out and re-add it elsewhere.

- [ ] Settings → Secrets and variables → Actions → **Variables**. Repository
      level, not environment — the smoke job has no `environment:` binding and
      cannot read environment-scoped variables:

```
IOS_BUNDLE_IDENTIFIER    com.<yourname>.gentletasktimer
APPLE_TEAM_ID            (value from .env)
```

- [ ] Settings → Environments → New → **`ios-release`**
  - [ ] Deployment branches and tags → Selected → add rule `v*`

- [ ] `ios-release` → **Environment secrets** → Add secret, three times:

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

- [ ] Confirm three are listed, and that none leaked to repository level:

```bash
gh secret list --env ios-release
gh secret list
```

- [ ] Only now, delete the local `.p8`:

```bash
shred -u AuthKey_XXXXXXXXXX.p8
```

- [ ] Settings → Actions → General → Fork pull request workflows → confirm
      "Require approval for first-time contributors".

- [ ] Settings → Code security → enable **Secret scanning** and **Push protection**.

- [ ] Add repository description and topics (`ios`, `react-native`, `expo`,
      `github-actions`, `testflight`).

---

## Phase 5 — Project

- [x] `.env` created locally
- [ ] `IOS_BUNDLE_IDENTIFIER` in `.env` matches Phase 2 exactly
- [ ] Real app icon in place

---

## Phase 6 — CI/CD

- [ ] Confirm CI is green on the first push (Actions tab).

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

- [ ] Install TestFlight on your iPhone.
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
