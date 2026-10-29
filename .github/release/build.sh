#!/usr/bin/env bash
# Builds only the two published packages.
set -euo pipefail
pnpm build --filter=@pcvl/schema --filter=@pcvl/compiler
