#!/usr/bin/env bash
# Installs the tarballs into a copy of the docs' StackBlitz project, in place of
# its `next` dist-tag, then type-checks it: `pvl compile` on its Schema, then `tsc`.
# TypeScript is installed here, not in the project, so StackBlitz's install stays small.
set -euo pipefail
cp -R "$(dirname "$0")/../../stackblitz/get-started-docs" "$RUNNER_TEMP/get-started-docs"
cd "$RUNNER_TEMP/get-started-docs"
npm install --strict-peer-deps --no-audit --no-fund "$RUNNER_TEMP"/tarballs/*.tgz typescript@6.0.3 @types/node@^22.19.0
npx pvl compile
npx tsc
