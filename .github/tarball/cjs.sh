#!/usr/bin/env bash
# Requires both packages as CJS.
set -euo pipefail
cd "$RUNNER_TEMP/consumer"
node out/src/cjs.cjs
