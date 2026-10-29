#!/usr/bin/env bash
# Publishes every package whose version isn't on npm yet, with provenance.
set -euo pipefail
pnpm -r publish --tag "$DIST_TAG" --provenance --no-git-checks
