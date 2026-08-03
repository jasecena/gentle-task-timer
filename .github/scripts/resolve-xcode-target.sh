#!/usr/bin/env bash
#
# Locates the Xcode workspace/project and the scheme to archive, so the release
# workflow does not need those names hard-coded. Emits GitHub Actions
# `key=value` output lines on stdout.
#
# Outputs:
#   workspace  path to the .xcworkspace, or empty
#   project    path to the .xcodeproj, used only when there is no workspace
#   scheme     the scheme to archive
#
# Env:
#   SCHEME_OVERRIDE  optional explicit scheme name

set -euo pipefail

workspace=""
project=""

# CocoaPods generates a workspace, and building the .xcodeproj directly would
# miss the Pods target — so a workspace always wins when one exists.
for dir in ios .; do
  [[ -d "$dir" ]] || continue
  found="$(find "$dir" -maxdepth 1 -name '*.xcworkspace' -not -name 'project.xcworkspace' | head -1)"
  if [[ -n "$found" ]]; then
    workspace="$found"
    break
  fi
done

if [[ -z "$workspace" ]]; then
  for dir in ios .; do
    [[ -d "$dir" ]] || continue
    found="$(find "$dir" -maxdepth 1 -name '*.xcodeproj' | head -1)"
    if [[ -n "$found" ]]; then
      project="$found"
      break
    fi
  done
fi

if [[ -z "$workspace" && -z "$project" ]]; then
  echo "::error::No .xcworkspace or .xcodeproj found. If this is an Expo or Flutter app, the prebuild step did not run or failed." >&2
  exit 1
fi

if [[ -n "$workspace" ]]; then
  list_args=(-workspace "$workspace")
else
  list_args=(-project "$project")
fi

schemes_json="$(xcodebuild -list -json "${list_args[@]}")"
mapfile -t schemes < <(printf '%s' "$schemes_json" | jq -r '(.workspace // .project).schemes[]')

if (( ${#schemes[@]} == 0 )); then
  echo "::error::No shared schemes found. In Xcode, mark the scheme as Shared and commit the resulting .xcscheme file." >&2
  exit 1
fi

if [[ -n "${SCHEME_OVERRIDE:-}" ]]; then
  scheme="$SCHEME_OVERRIDE"
  # Fail loudly on a typo rather than letting xcodebuild guess.
  if ! printf '%s\n' "${schemes[@]}" | grep -Fxq "$scheme"; then
    echo "::error::Scheme '${scheme}' not found. Available: ${schemes[*]}" >&2
    exit 1
  fi
else
  # Pods-* schemes are CocoaPods bookkeeping, never the app.
  scheme=""
  for candidate in "${schemes[@]}"; do
    [[ "$candidate" == Pods-* ]] && continue
    scheme="$candidate"
    break
  done
  [[ -n "$scheme" ]] || scheme="${schemes[0]}"
fi

echo "Resolved workspace='${workspace}' project='${project}' scheme='${scheme}'" >&2
echo "Available schemes: ${schemes[*]}" >&2

echo "workspace=${workspace}"
echo "project=${project}"
echo "scheme=${scheme}"
