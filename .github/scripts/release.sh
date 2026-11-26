#!/usr/bin/env bash
# Makes a release: checks everything, sets the version in manifest.json,
# commits, tags and pushes. GitHub Actions does the rest (GitHub release and
# Mozilla submission, see .github/workflows/release.yml).
#
# Usage: .github/scripts/release.sh 0.1.3
#        .github/scripts/release.sh --dry-run 0.1.3
#
# --dry-run runs every check, shows the release notes and builds the zip the
# release would make, then stops. It changes no files and pushes nothing.
#
# Before running it, add the new version's entry at the top of CHANGELOG.md and
# its compare link at the bottom. Those edits can be uncommitted; this script
# commits them together with the manifest change.
#
# On Windows, run it from Git Bash.

set -euo pipefail

die() { echo "Error: $*" >&2; exit 1; }

dry_run=false
args=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    -*) die "unknown option '$arg'. The only option is --dry-run." ;;
    *) args+=("$arg") ;;
  esac
done

[ ${#args[@]} -eq 1 ] || die "give the new version, for example: $0 0.1.3 (or $0 --dry-run 0.1.3)"
version="${args[0]}"
tag="v$version"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "'$version' doesn't look like a version number (expected something like 0.1.3)."

cd "$(git rev-parse --show-toplevel)"

# --- Git state -------------------------------------------------------------

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] || die "you're on '$branch'. Switch to main first."

# Only CHANGELOG.md and manifest.json may have changes; anything else would be
# left out of the release commit by accident.
other_changes=$(git status --porcelain | grep -vE '^[ M]{2} (CHANGELOG\.md|manifest\.json)$' || true)
[ -z "$other_changes" ] || die "there are changes besides CHANGELOG.md and manifest.json. Commit or stash them first:
$other_changes"

echo "Fetching from origin..."
git fetch --tags origin main
behind=$(git rev-list --count HEAD..origin/main)
[ "$behind" -eq 0 ] || die "your main is $behind commit(s) behind origin/main. Run 'git pull' first."

git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists. Pick a new version number."

latest=$(git tag --list 'v*' --sort=-v:refname | head -n1)
if [ -n "$latest" ]; then
  highest=$(printf '%s\n%s\n' "${latest#v}" "$version" | sort -V | tail -n1)
  [ "$highest" = "$version" ] && [ "$version" != "${latest#v}" ] \
    || die "$version isn't higher than the latest release ($latest)."
fi

# --- Changelog -------------------------------------------------------------

notes=$(.github/scripts/changelog-section.sh "$version") \
  || die "add a '## [$version] - $(date +%F)' entry at the top of CHANGELOG.md first."

heading=$(grep -m1 -F "## [$version]" CHANGELOG.md)
[[ "$heading" == *"$(date +%F)"* ]] || echo "Note: the changelog heading is '$heading', which isn't dated today ($(date +%F))."

grep -qF "[$version]: " CHANGELOG.md \
  || die "add a compare link at the bottom of CHANGELOG.md:
[$version]: https://github.com/KIFFCollective/BetterWatchLater/compare/${latest}...$tag"

# --- Manifest --------------------------------------------------------------

# The new manifest goes into a temporary file first. manifest.json itself only
# changes after you say yes, so stopping (or --dry-run) leaves nothing behind.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Matches "version" but not "manifest_version" (that one has _ before version).
sed -E "s/(\"version\": *\")[^\"]*\"/\1$version\"/" manifest.json > "$work/manifest.json"
grep -qE "\"version\": *\"$version\"" "$work/manifest.json" || die "couldn't set the version in manifest.json. Check it by hand."

# --- Dry run ----------------------------------------------------------------

if $dry_run; then
  # Build the zip from a throwaway commit: HEAD plus the new manifest, made
  # with a temporary index so the working folder and branch stay untouched.
  # It's the same build-zip.sh the release workflow runs on the tag.
  export GIT_INDEX_FILE="$work/index"
  git read-tree HEAD
  blob=$(git hash-object -w "$work/manifest.json")
  git update-index --cacheinfo "100644,$blob,manifest.json"
  trial_commit=$(git commit-tree "$(git write-tree)" -p HEAD -m "Dry run of $version")
  unset GIT_INDEX_FILE

  zip="better-watch-later-$version-dry-run.zip"
  .github/scripts/build-zip.sh "$trial_commit" "$work/$zip"
  echo
  echo "Files in $zip:"
  if command -v node >/dev/null; then
    node tests/check-zip.mjs "$work/$zip" || die "the zip check failed (see above)."
    zip_check="checked: nothing missing or extra"
  else
    git ls-tree -r --name-only "$trial_commit" manifest.json src icons LICENSE.md
    zip_check="not checked, Node isn't installed"
  fi

  echo
  echo "Dry run for $version (previous: ${latest:-none}). All checks passed."
  echo "Release notes:"
  echo "--------------------------------------------------"
  printf '%s\n' "$notes"
  echo "--------------------------------------------------"
  echo "manifest.json would change to: $(grep -oE '"version": *"[^"]*"' "$work/manifest.json")"
  echo "Zip the release would build: $zip ($zip_check)"
  echo
  echo "Nothing was committed, tagged or pushed, and no files changed."
  echo "To release for real, run: $0 $version"
  exit 0
fi

# --- Confirm and go ---------------------------------------------------------

echo
echo "About to release $version (previous: ${latest:-none})."
echo "Release notes:"
echo "--------------------------------------------------"
printf '%s\n' "$notes"
echo "--------------------------------------------------"
echo
echo "This commits CHANGELOG.md and manifest.json, tags $tag and pushes both."
echo "GitHub Actions then creates the release and submits it to Mozilla."
read -r -p "Go ahead? [y/N] " answer
if [[ ! "$answer" =~ ^[Yy]$ ]]; then
  echo "Stopped. Nothing was changed."
  exit 1
fi

cp "$work/manifest.json" manifest.json
git add CHANGELOG.md manifest.json
git commit -m "Release $version"
git tag -a "$tag" -m "Better Watch Later $version"
# --atomic: either both the commit and the tag arrive, or neither does.
git push --atomic origin main "$tag"

echo
echo "Pushed. Watch it at https://github.com/KIFFCollective/BetterWatchLater/actions"
