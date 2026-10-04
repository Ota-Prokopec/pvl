# Configuration and CLI

How a user drives `@pvl/schema-compiler`. Read this before you change `pvlconfig.json`, a CLI flag, or a diagnostic.

## `pvlconfig.json`

`pvlconfig.json` carries `$schema`, `include` (default `["src/schemas/**/*.ts"]`), `destination`, `withTypes` and `watch`. Its own schema is defined with `@pvl/schema` and the shipped `json-schema.json` is generated from that definition and exported under `./json-schema`, so the runtime check and the editor schema cannot drift. The destination path and `node_modules` are always excluded from `include`, so the compiler cannot read its own output. Relative paths resolve against the directory holding the config.

## `pvl compile`

The CLI is `pvl compile`, built with yargs (see the `cli-developer` skill). Every setting is also a flag, plus `--config`, `--watch`, `--strict` and `--json`; precedence is flags, then config file, then defaults. **Nothing is written when any error fired** — a partially written `Destination File` that still typechecks is worse than no output.

## Diagnostics

Every diagnostic carries a stable, publicly documented code, so users and tests refer to codes rather than message text.
