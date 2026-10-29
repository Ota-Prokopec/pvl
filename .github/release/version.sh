#!/usr/bin/env bash
# Exports VERSION, DIST_TAG and PRERELEASE to later steps: a `-next.N` version
# publishes on the `next` dist-tag as a prerelease, anything else on `latest`.
set -euo pipefail
version=$(jq -r .version packages/schema/package.json)
tag=latest prerelease=false
if [[ $version == *-* ]]; then
  tag=${version#*-}
  tag=${tag%%.*}
  prerelease=true
fi
printf 'VERSION=%s\nDIST_TAG=%s\nPRERELEASE=%s\n' "$version" "$tag" "$prerelease" >> "$GITHUB_ENV"
