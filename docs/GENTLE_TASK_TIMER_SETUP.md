# Gentle Task Timer — setup steps

Reference and troubleshooting: [DEPLOYMENT.md](DEPLOYMENT.md).
Generic template for the next project: [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md).

Repository visibility: **public**.

**Status: shipped.** Tag `v0.1.0` built, uploaded and reached TestFlight;
installed on device and running as expected. The pipeline needs no further
setup.

**Remaining:**

1. Delete the local `.p8` (Phase 4).
2. Releases are now tag-driven and gated on approval — see Phase 6 for the
   sequence.

---

## Phase 0 — Local

- [x] Set your git identity — commits author as the GitHub noreply address
- [x] Confirm `LICENSE` credits you — `Copyright (c) 2026 Jason`
- [x] Set your bundle identifier in `.env` (gitignored)
- [x] Replace `assets/icon.png` (1024×1024, RGB, no alpha) — progress ring in
      the app's own palette. `assets/splash-icon.png` matches it
- [x] Verify — `npm run verify` green, 194 tests, `expo-doctor` 20/20

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

- [ ] Capabilities: enable **Push Notifications**. Required from v0.3 — the
      bundled alert sounds need the `expo-notifications` config plugin, and that
      plugin writes an `aps-environment` entitlement. Without the capability,
      cloud signing cannot issue a profile and the release fails at
      `-exportArchive`.

```
Identifiers -> com.<yourname>.lifetimer -> Capabilities
[x] Push Notifications
Save
```

- [ ] Nothing else. No key, no certificate, no APNs configuration — the app
      sends no remote push and never contacts a server.

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
Role:  Admin
```

Admin is required: cloud managed signing creates the distribution certificate,
and App Manager may upload builds but not mint certificates. A key's role cannot
be changed after creation, so an existing App Manager key must be revoked and
replaced — the Key ID changes, so update the secrets in Phase 4 as well.

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
  - [x] Tightened after the first release: `main` removed, required reviewer
        added, admin bypass off. Only a `v*` tag can now reach the Apple
        credentials, and every release waits for an approval in the Actions tab.

```bash
# Drop the main rule (list ids first, then delete the one named "main")
gh api repos/:owner/:repo/environments/ios-release/deployment-branch-policies
gh api -X DELETE repos/:owner/:repo/environments/ios-release/deployment-branch-policies/<id>

# Required reviewer, no admin bypass
gh api -X PUT repos/:owner/:repo/environments/ios-release \
  -F wait_timer=0 -F prevent_self_review=false -F can_admins_bypass=false \
  -f 'reviewers[][type]=User' -F "reviewers[][id]=$(gh api user --jq .id)" \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
```

> Dry runs move to pre-release tags — `v0.1.1-rc1` matches both the `v*`
> environment rule and the workflow's tag trigger. A **Run workflow** from
> `main` is now rejected at the environment gate.

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

- [x] Actions → iOS Release → Run workflow, **submit_to_testflight UNCHECKED**.

- [x] Re-run with **submit_to_testflight CHECKED**.

- [x] Switch to tag-driven releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Every release from here:

```bash
git tag v0.2.0 && git push origin v0.2.0
gh run watch                      # then approve the ios-release deployment
```

The run pauses at **Build & upload to TestFlight** until the deployment is
approved (Actions → the run → Review deployments). Apple then processes the
build for 5–30 minutes before it appears in TestFlight.

- [ ] Optional: set repository variable `ENABLE_SMOKE_TEST=true`.

---

## Phase 7 — Device testing

- [x] Install TestFlight on your iPhone.
- [x] App Store Connect → Gentle Task Timer → TestFlight → Internal Testing →
      add yourself, accept the invite, install.
- [x] Start a 2-minute timer; confirm it counts down correctly.
- [x] Vibration fires at a phase boundary.
- [ ] Pause, wait a minute, resume — elapsed time must exclude the pause.
- [ ] Background the app mid-run for 5+ minutes, reopen — must show the correct
      phase and remaining time.
- [ ] Lock the screen mid-run, reopen — same expectation.
- [ ] Screen stays awake while running, sleeps when paused or idle.
- [ ] Airplane mode: identical behaviour.
- [ ] Battery over a 30-minute session.

Notifications (from the next build on):

- [ ] First **Start** shows the system permission prompt; allow it.
- [ ] Background the app mid-phase — banner and sound arrive at the boundary.
- [ ] Lock the screen mid-phase — same, on the lock screen.
- [ ] Pause, wait past a boundary — no alert arrives.
- [ ] Reset mid-run — no alert arrives afterwards.
- [ ] Deny the prompt (Settings → Gentle Task Timer → Notifications off) — the
      app says alerts only work while it is open, and still vibrates in the
      foreground.
- [ ] Focus mode on: alerts are silenced. This is expected — Time Sensitive
      delivery needs an entitlement the App ID deliberately does not have.

Multiple timers:

- [ ] Add a second timer, start both — both count down, each with its own name.
- [ ] Pause one — the other keeps going.
- [ ] Let a boundary pass on each — the banner names the timer that finished.
- [ ] Force-quit mid-run and reopen — both come back where they should be.
- [ ] Delete a timer mid-run — its alerts stop, the other timer's do not.

One-off notes:

- [ ] Add a note for a time two minutes away — it arrives once, with the note as
      the banner title.
- [ ] Reopen the app afterwards — the note is gone from the list.
- [ ] Add a note, then delete it before it fires — nothing arrives.
- [ ] Confirm a fired note stays in Notification Centre; a timer alert does not.

Sound:

- [ ] Set a timer to Chime, a note to Bell, the schedule to Marimba — each
      alert plays its own voice, with the app closed.
- [ ] Set one back to Default — the system sound returns.

Vibration:

- [ ] Set 10s and let a boundary pass with the app open — the phone buzzes in a
      train for about ten seconds.
- [ ] Press any control mid-buzz — it stops immediately.
- [ ] Set Off — no buzz at a boundary, notification still arrives.
- [ ] Confirm a buzz with the app **closed** is the standard single one. That is
      the platform's limit, not a bug: a long buzz needs the app running.
- [ ] Low Power Mode on — expect no haptics at all, again the platform's rule.

Persistence:

- [ ] Start a run, force-quit the app, reopen after two minutes — the run is
      still going, two minutes further along.
- [ ] The reopen must not fire a burst of buzzes for boundaries already passed.
- [ ] Force-quit while paused — reopens paused, at the same position.

Schedule tab:

- [ ] Set every 30m, 09:00–17:00, Mon–Fri — the count reads 85 of 48 and Start
      is disabled.
- [ ] Widen to hourly — 45 of 48, Start enabled.
- [ ] Arm it, force-quit the app, and confirm an alert still arrives at the next
      slot.
- [ ] Press Stop, wait past a slot — nothing arrives.
- [ ] Arm a schedule, then start a timer run — both sets of alerts arrive; one
      does not cancel the other.
- [ ] Editing an armed schedule disarms it, and its pending alerts stop.
