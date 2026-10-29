#!/usr/bin/env bash
# Installs the tarballs into a copy of the docs' StackBlitz project, in place of
# its `next` dist-tag, and runs its `check-types`: `pvl compile` on its Schema, then `tsc`.
set -euo pipefail
cp -R "$(dirname "$0")/../../stackblitz/get-started-docs" "$RUNNER_TEMP/get-started-docs"
cd "$RUNNER_TEMP/get-started-docs"
npm install --strict-peer-deps --no-audit --no-fund "$RUNNER_TEMP"/tarballs/*.tgz
npm run check-types
