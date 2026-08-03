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

- [ ] Settings → Secrets and variables → Actions → **Variables**:

```
IOS_BUNDLE_IDENTIFIER    com.<yourname>.gentletasktimer
APPLE_TEAM_ID            (value from .env)
```

- [ ] Same page → **Secrets**:

```
APP_STORE_CONNECT_KEY_ID         10-char key id
APP_STORE_CONNECT_ISSUER_ID      the UUID
APP_STORE_CONNECT_PRIVATE_KEY    whole .p8, BEGIN/END lines included
```

```bash
xclip -selection clipboard < AuthKey_XXXXXXXXXX.p8   # X11
wl-copy < AuthKey_XXXXXXXXXX.p8                      # Wayland
```

- [ ] Delete the local `.p8`.

- [ ] Settings → Environments → New → **`ios-release`**
  - [ ] Move the three `APP_STORE_CONNECT_*` secrets into it
  - [ ] Deployment branches and tags → Selected → add rule `v*`

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
