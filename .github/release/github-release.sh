#!/usr/bin/env bash
# Tags the commit vX.Y.Z with a GitHub Release of both packages' changelog
# sections for that version, unless that release already exists.
set -euo pipefail
gh release view "v$VERSION" >/dev/null 2>&1 && exit 0
for pkg in schema compiler; do
  section=$(awk -v heading="## $VERSION" '$0 == heading { on = 1; next } /^## / { on = 0 } on' "packages/$pkg/CHANGELOG.md")
  if [[ -z ${section//[[:space:]]/} ]]; then
    echo "::error::packages/$pkg/CHANGELOG.md has no '## $VERSION' section"
    exit 1
  fi
  printf '## @pcvl/%s\n%s\n\n' "$pkg" "$section"
done > "$RUNNER_TEMP/notes.md"
gh release create "v$VERSION" --target "$GITHUB_SHA" --title "v$VERSION" \
  --notes-file "$RUNNER_TEMP/notes.md" --prerelease="$PRERELEASE"
