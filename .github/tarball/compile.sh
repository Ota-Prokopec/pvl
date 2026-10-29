#!/usr/bin/env bash
# Runs the packed `pvl` CLI on the consumer's Schemas.
set -euo pipefail
cd "$RUNNER_TEMP/consumer"
npx --no-install pvl compile
