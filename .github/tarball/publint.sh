#!/usr/bin/env bash
# Checks both manifests for publishing mistakes (exports, files, fields).
set -euo pipefail
pnpm dlx publint@0.3.25 packages/schema
pnpm dlx publint@0.3.25 packages/compiler
