#!/usr/bin/env bash
# Copies the consumer project outside the workspace, where no `@repo/*`
# resolves, and installs the tarballs into it. Its JSON configs are written
# here: as files in the repo, the workspace lint would hold them to its entry rules.
set -euo pipefail
cp -R "$(dirname "$0")/consumer" "$RUNNER_TEMP/consumer"
cd "$RUNNER_TEMP/consumer"
echo '{ "private": true, "type": "module" }' > package.json
# Strict, so a peer range that misses the packed `@pcvl/schema` fails the install.
npm install --strict-peer-deps --no-audit --no-fund "$RUNNER_TEMP"/tarballs/*.tgz typescript@6.0.3
echo '{}' > pvlconfig.json
cat > tsconfig.json <<'JSON'
{ "compilerOptions": { "module": "nodenext", "strict": true, "outDir": "out", "types": [] }, "include": ["src"] }
JSON
