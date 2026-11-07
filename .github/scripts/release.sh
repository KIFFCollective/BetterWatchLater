#!/usr/bin/env bash
# Makes a release: checks everything, sets the version in manifest.json,
# commits, tags and pushes. GitHub Actions does the rest (GitHub release and
# Mozilla submission, see .github/workflows/release.yml).
#
# Usage: .github/scripts/release.sh 0.1.3
#
# Before running it, add the new version's entry at the top of CHANGELOG.md and
# its compare link at the bottom. Those edits can be uncommitted; this script
# commits them together with the manifest change.
#
# On Windows, run it from Git Bash.

set -euo pipefail

die() { echo "Error: $*" >&2; exit 1; }

[ $# -eq 1 ] || die "give the new version, for example: $0 0.1.3"
version="$1"
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

# Matches "version" but not "manifest_version" (that one has _ before version).
sed -i -E "s/(\"version\": *\")[^\"]*\"/\1$version\"/" manifest.json
grep -qE "\"version\": *\"$version\"" manifest.json || die "couldn't set the version in manifest.json. Check it by hand."

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
  echo "Stopped. manifest.json now says $version; undo with: git checkout manifest.json"
  exit 1
fi

git add CHANGELOG.md manifest.json
git commit -m "Release $version"
git tag -a "$tag" -m "Better Watch Later $version"
# --atomic: either both the commit and the tag arrive, or neither does.
git push --atomic origin main "$tag"

echo
echo "Pushed. Watch it at https://github.com/KIFFCollective/BetterWatchLater/actions"
