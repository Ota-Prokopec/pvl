#!/usr/bin/env bash
# Checks each tarball's per-format types resolve.
# node10 resolution can't reach the `./json-schema` subpath export.
set -euo pipefail
for tarball in "$RUNNER_TEMP"/tarballs/*.tgz; do
  pnpm dlx @arethetypeswrong/cli@0.18.5 --profile node16 "$tarball"
done
