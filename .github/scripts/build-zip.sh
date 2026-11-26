#!/usr/bin/env bash
# Builds the extension zip from a tag or commit. The release and the pull
# request checks both use this, so a trial build is the same as the real one.
#
# Usage: build-zip.sh <tag-or-commit> <output.zip>

set -euo pipefail

ref="$1"
output="$2"

# Built straight from the commit, not the checked-out folder. Only the files the
# browser needs go in (the icon's SVG source rides along in icons/, which is
# harmless); .git, .github, tests, README and CHANGELOG stay out.
paths=()
for path in manifest.json src icons LICENSE.md; do
  # Older tags don't have everything (icons/ arrived after 0.1.1).
  if git cat-file -e "$ref:$path" 2>/dev/null; then
    paths+=("$path")
  fi
done

git archive --format=zip --output "$output" "$ref" "${paths[@]}"
