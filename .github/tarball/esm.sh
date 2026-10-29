#!/usr/bin/env bash
# Imports both packages as ESM.
set -euo pipefail
cd "$RUNNER_TEMP/consumer"
node out/src/esm.js
