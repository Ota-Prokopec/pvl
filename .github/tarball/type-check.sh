#!/usr/bin/env bash
# Type-checks against the shipped declarations, so a declaration importing a
# package the tarball doesn't depend on fails it.
set -euo pipefail
cd "$RUNNER_TEMP/consumer"
npx --no-install tsc
