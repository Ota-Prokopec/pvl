# Configuration and CLI

How a user drives `@pvl/schema-compiler`. Read this before you change `pvlconfig.json`, a CLI flag, or a diagnostic.

## `pvlconfig.json`

`pvlconfig.json` carries `$schema`, `include` (default `["src/schemas/**/*.ts"]`), `destination`, `withTypes` (default `true`) and `watch` (default `false`). Every key is optional, and an unknown key is an error, so a typo is reported rather than ignored. Its own schema is `configSchema`, defined with `@pvl/schema`; the shipped JSON Schema is generated from it at build time (`configJsonSchema()`, written to `dist/json-schema.json` and exported as `@pvl/schema-compiler/json-schema`), so the runtime check and the editor schema can't drift. Point `$schema` at `./node_modules/@pvl/schema-compiler/dist/json-schema.json` for autocomplete.

`node_modules` and the destination path are always excluded from `include`, so the compiler can't read its own output.

## The anchor

Every relative path (`include`, `destination`, and the same settings passed as flags) resolves against the **anchor**: the directory holding the config file, or the working directory for a run with no config file. `pvl compile --config apps/web/pvlconfig.json` from the repo root therefore behaves exactly like `pvl compile` from `apps/web`. Without `--config`, the compiler looks for `pvlconfig.json` in the working directory only.

## `pvl compile`

The CLI is `pvl compile`, built with yargs. Every setting is also a flag (`--include <glob...>`, `--destination <path>`, `--with-types`/`--no-with-types`, `--watch`), plus:

| Flag              | Effect                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `--config <path>` | The config file to read, relative to the working directory                                    |
| `--strict`        | Promotes every warning to an error                                                            |
| `--json`          | Prints the run's `CompilePayload` as one JSON document on stdout only, a usage error included |

Precedence is flags, then the config file, then defaults. A run with no config file at all is valid as long as at least one setting is passed as a flag; with neither, it fails with `NO_CONFIG`.

Without `--json`, each diagnostic is printed to stderr as `<severity> <code>: <message> (<file>)`, the severity in lower case, and the written path to stdout. A one-shot run exits `1` when any error fired (an unknown flag included) and `0` otherwise, warnings included unless `--strict`. **Nothing is written when any error fired**: a partially written Destination File that still typechecks is worse than no output.

The programmatic entry point is `compile({ cwd, configPath, overrides, strict })` from `@pvl/schema-compiler`; the CLI is a thin wrapper over it, and a bundler plugin would be another.

## Diagnostics

Every diagnostic carries a stable, publicly documented code, so users and tests refer to codes rather than message text. The codes are `DIAGNOSTIC_CODE`'s values, and the severity each is raised with is `DIAGNOSTIC_SEVERITY`'s.

| Code                         | Severity  | Raised when                                                                                                                                  |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_CONFIG`                  | `ERROR`   | No `pvlconfig.json` in the working directory, no `--config`, and no setting passed as a flag                                                 |
| `CONFIG_UNREADABLE`          | `ERROR`   | The config file named by `--config` doesn't exist, or the config file can't be read or isn't valid JSON                                      |
| `INVALID_CONFIG`             | `ERROR`   | A setting, from the config file or a flag, fails `configSchema` (wrong type, unknown key); one diagnostic per failing setting                |
| `NO_INPUT_FILES`             | `ERROR`   | `include` matched no file                                                                                                                    |
| `DESTINATION_UNWRITABLE`     | `ERROR`   | `destination` is a directory, a parent of it is a file, or it can't be created or written                                                    |
| `DESTINATION_INSIDE_INCLUDE` | `ERROR`   | An `include` pattern matches the destination, so the compiler would read its own output, whether the destination is inside the anchor or not |
| `FILE_EXPORTS_NOTHING`       | `WARNING` | A scanned file has no export, so the Destination File mirrors nothing from it                                                                |
| `INVALID_ARGUMENTS`          | `ERROR`   | The CLI got an unknown flag, a flag value of the wrong type, or no command (CLI only)                                                        |
