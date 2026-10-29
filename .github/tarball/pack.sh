#!/usr/bin/env bash
# Packs both packages into the .tgz files `npm publish` would upload.
set -euo pipefail
pnpm --filter "@pcvl/*" pack --pack-destination "$RUNNER_TEMP/tarballs"
