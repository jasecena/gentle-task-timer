# Security

## Reporting

This is a personal project. Open a GitHub issue, or for something you would
rather not post publicly, use GitHub's private vulnerability reporting
(**Security → Report a vulnerability**).

## Threat model

The app is an offline timer. It makes no network requests, holds no credentials,
stores no personal data and integrates no analytics or crash reporting. App
Transport Security is enforced with no exception domains, and
`ITSAppUsesNonExemptEncryption` is declared false because there is no
encryption to declare.

The realistic attack surface is therefore not the app — it is the **release
pipeline**, which holds an App Store Connect key capable of publishing builds
under the owner's developer account.

## Controls

### Credentials

- No credential is ever committed. `.gitignore` blocks `*.p8`, `*.p12`, `*.pem`,
  `*.key`, `*.cer`, `*.mobileprovision`, `*.keystore`, `private_keys/`,
  `.appstoreconnect/` and `.env`.
- Gitleaks scans **full history** on every pull request, on pushes to `main`,
  and weekly — a secret that was committed and later removed is still in the git
  objects, and still compromised.
- A pre-commit hook runs `gitleaks protect --staged` locally, so the common case
  is caught before the credential ever leaves the machine.
- The App Store Connect key is scoped **App Manager**, the least privilege that
  can upload a build. Not Admin.

### Handling secrets in CI

- Secrets are bound to `env`, never interpolated into `run:` script text with
  `${{ secrets.* }}`. Interpolation pastes the value into the script, where a
  quote or backtick could break parsing or be evaluated.
- Steps touching key material use `set +x`, `umask 077` and `chmod 600`.
- The generated keychain password is passed through `::add-mask::` before it can
  reach a log.
- A dedicated keychain is created in `$RUNNER_TEMP`, auto-locks after an hour,
  and is deleted — along with the `.p8` and any `.p12` — in an `if: always()`
  teardown that runs on success, failure and cancellation alike.

### Access control

- `permissions: contents: read` at workflow level. `security-events: write` is
  granted only to the CodeQL job that needs it.
- The release job runs in a protected `ios-release` environment, so credentials
  are unreachable from fork pull requests. Deployment can be restricted to `v*`
  tags and gated on a required reviewer.
- Releases are never triggered by an ordinary commit — only by an explicit tag
  push or a manual dispatch.

### Supply chain

- Every GitHub Action is pinned to a full 40-character commit SHA. A mutable tag
  can be repointed at malicious code without any change to this repository.
- A CI job (`actions-pinning`) fails the build if anyone adds an unpinned
  reference, so the guarantee does not depend on review discipline.
- No third-party action handles credentials — Xcode selection uses
  `xcode-select` directly rather than a community action.
- Dependabot updates both npm packages and the action SHA pins weekly. Pinning
  without updating just means never receiving security fixes.
- `npm ci` in CI, so the lockfile is installed exactly and a drifted
  `package.json` fails the build.

### Dependencies

`npm audit` runs on every PR and weekly, failing on **high or critical**.
Moderate findings are reported but do not block, because build-time tooling
advisories would otherwise gate every release on something that never ships in
the app binary.

Where a transitive advisory has no upstream fix, it is resolved with a scoped
`overrides` entry in `package.json` rather than by downgrading — the current
example being `uuid` pulled in via `xcode` → `@expo/config-plugins`, pinned
forward to `^11.1.1`.

## Known accepted risks

**Cloud-managed signing.** The workflow lets Xcode create and download the
distribution certificate on the runner via `-allowProvisioningUpdates`. This is
Apple's supported mechanism and avoids a long-lived `.p12` in GitHub Secrets,
but it does mean the API key can mint certificates. The tighter alternative — a
pre-created certificate supplied as `IOS_DIST_CERT_P12_BASE64` — is supported by
the workflow and is the better choice for a shared team account.

**Build artifacts.** Each run uploads the signed IPA and dSYMs as a GitHub
artifact for 14 days. On a public repository, artifacts are downloadable by
anyone. Keep the repository private, or drop the IPA from the artifact list.
