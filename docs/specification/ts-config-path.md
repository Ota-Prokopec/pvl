# Spec: the `tsConfigPath` setting and the application's module resolution

Spec issue: [#125](https://github.com/Ota-Prokopec/pvl/issues/125). Read this before you change which tsconfig `@pvl/schema-compiler` reads or how the mirror resolves module specifiers.

## Problem Statement

`pvl compile` reads the application's tsconfig from one fixed place: `tsconfig.json` in the base directory (the directory holding `pvlconfig.json`, or the working directory when there's no config file). This fails in two ways:

- **The tsconfig can't be chosen.** An application whose aliases live in `tsconfig.app.json`, or in a tsconfig outside the base directory, can't point the compiler at it. The compiler then either rewrites no alias imports in the mirror, or reads the wrong `paths`.
- **The application's module resolution is overridden.** Whatever the tsconfig says, the compiler forces bundler module resolution over it. For an application on `NodeNext` (or any other resolution mode), a module specifier in the mirror can resolve to a different file than it does in the application's own build, so an import can be rewritten to the wrong target.

## Solution

A new setting, `tsConfigPath`, names the tsconfig the compiler reads. Like every other setting, it can be set in `pvlconfig.json` or passed as a flag (`--ts-config-path`). It defaults to `tsconfig.json` and resolves against the base directory, the same as every other path setting.

The compiler then resolves module specifiers the way that tsconfig says. The tsconfig's own module resolution options drive resolution, and bundler resolution is only the fallback for an application whose tsconfig chain sets neither `module` nor `moduleResolution`.

## User Stories

1. As an application developer whose aliases live in `tsconfig.app.json`, I want to set `"tsConfigPath": "tsconfig.app.json"` in `pvlconfig.json`, so that alias imports in my Schemas are rewritten in the mirror.
2. As an application developer, I want to pass `--ts-config-path <path>` on the command line, so that I can pick a tsconfig for one run without editing `pvlconfig.json`.
3. As an application developer, I want `--ts-config-path` to win over `tsConfigPath` in `pvlconfig.json`, so that flags take precedence the way every other setting's flag does.
4. As an application developer with a plain `tsconfig.json` next to `pvlconfig.json`, I want to configure nothing, so that the default keeps working as it does today.
5. As an application developer with no tsconfig at all, I want the run to succeed without one, so that a project that has no tsconfig isn't forced to create one.
6. As an application developer, I want a relative `tsConfigPath` to resolve against the directory holding `pvlconfig.json`, so that `pvl compile --config apps/web/pvlconfig.json` from the repo root behaves exactly like `pvl compile` from `apps/web`.
7. As an application developer running without a config file, I want a relative `--ts-config-path` to resolve against the working directory, so that it behaves like every other path flag.
8. As an application developer, I want an absolute `tsConfigPath` to be used as given, so that I can point at a tsconfig outside the base directory.
9. As an application developer who mistyped `tsConfigPath`, I want the run to fail with `TSCONFIG_UNREADABLE` naming the missing file, so that a typo doesn't quietly leave every alias pointing at the original modules.
10. As an application developer who pointed `tsConfigPath` at a directory, I want the run to fail with `TSCONFIG_UNREADABLE`, so that I learn the setting takes a file rather than getting a silent lookup.
11. As an application developer whose named tsconfig isn't valid JSON, or extends a file that can't be read, I want `TSCONFIG_UNREADABLE` as today, so that the error doesn't depend on which tsconfig was chosen.
12. As an application developer whose tsconfig uses `"moduleResolution": "NodeNext"`, I want the mirror's imports resolved the way `NodeNext` resolves them, so that each import is rewritten to the file my own build loads.
13. As an application developer whose tsconfig sets `baseUrl`, `rootDirs` or `customConditions`, I want those honoured during resolution, so that the mirror agrees with my build in every case those options decide.
14. As an application developer whose tsconfig sets neither `module` nor `moduleResolution` (directly or through `extends`), I want bundler resolution as the fallback, so that extension-less and `.js` specifiers still find their `.ts` files as they do today.
15. As an application developer whose tsconfig inherits `moduleResolution` through `extends`, I want the inherited value respected, so that a shared base config behaves like one written inline.
16. As an application developer whose Schemas import `.ts` files by extension, I want those imports to resolve whatever my tsconfig says, so that the mirror never fails on an import my own tooling accepts.
17. As an application developer whose Schemas import a `.js` or `.json` module, I want those imports to keep resolving, so that the stricter options in my tsconfig don't break the mirror.
18. As an application developer editing `pvlconfig.json`, I want `tsConfigPath` in the shipped JSON Schema, so that my editor autocompletes and validates it.
19. As an application developer, I want a non-string `tsConfigPath` reported as `INVALID_CONFIG`, so that a wrong type is caught like any other invalid setting.
20. As a CI maintainer, I want `--json` output to report `TSCONFIG_UNREADABLE` with the resolved tsconfig path as its `file`, so that tooling can point at the exact file.
21. As a maintainer of pvl, I want the change from forced bundler resolution to the application's resolution recorded in an ADR, so that the reasoning outlives this spec.
22. As a maintainer of pvl, I want the configuration and Destination Directory specs to describe the new setting and resolution rules, so that the docs match the behaviour.

## Implementation Decisions

- **New setting `tsConfigPath`**, added to `configSchema` as an optional string. Because every setting is also a flag, the CLI spells it `--ts-config-path`, and no short alias is added. The precedence is flag, then config file, then the default.
- **The default `"tsconfig.json"`** lives with the other setting defaults, and the resolved settings always carry a `tsConfigPath`.
- **Resolution:** a relative `tsConfigPath` resolves against the base directory, whether it came from the config file or a flag, the same rule `include`, `rootDir` and `destination` follow. An absolute path is used as is.
- **A missing file is allowed only for the implicit default.** When `tsConfigPath` was not given and the default file doesn't exist, the run goes ahead without a tsconfig, as today. When the user named a path, through the setting or the flag, the file has to exist. This mirrors how `--config` treats an implicit versus a named config file. Settings resolution therefore has to report whether `tsConfigPath` was given or defaulted.
- **Only a file is accepted.** Unlike `tsc -p`, a directory is not searched for a `tsconfig.json`. It fails with `TSCONFIG_UNREADABLE`.
- **`TSCONFIG_UNREADABLE` covers every failure:** a named file that's missing, a directory, an unreadable file, invalid JSON, and a broken `extends`. Its `file` is the resolved tsconfig path. It is still reported alone, before any file is read. No new diagnostic code is added.
- **The ts-morph project the mirror resolves through takes the resolved tsconfig path** instead of deriving `<baseDirectory>/tsconfig.json` itself. Relative paths inside the tsconfig (`paths`, `baseUrl`, `extends`) resolve against the tsconfig's own directory, as TypeScript resolves them.
- **Compiler options are merged in three layers, strongest first:**
  1. Always forced, whatever the tsconfig says: `noEmit` and `allowImportingTsExtensions` (nothing is emitted, and a `.ts`-extension import must resolve), plus `allowJs` and `resolveJsonModule` (a mirrored file's `.js`/`.json` imports must resolve).
  2. The tsconfig's own options, following `extends`: `module`, `moduleResolution`, `paths`, `baseUrl`, `rootDirs`, `customConditions` and the rest.
  3. The fallback, used only when the tsconfig chain sets neither `module` nor `moduleResolution`, and also when there is no tsconfig: `module: ESNext`, `moduleResolution: Bundler`.
- **The tsconfig's `include`/`files` stay ignored.** The mirror adds the scanned files itself, so a tsconfig whose `include` matches nothing is still fine.
- **The package-import rule is unchanged:** a bare module specifier that `node_modules` resolves is kept, even when the tsconfig's `paths` also maps it.
- **An ADR records the switch** from "always resolve like a bundler" to "resolve like the application's tsconfig, with bundler as the fallback", and why the four options stay forced.
- **Spec docs updated in the same change:**
  - the configuration and CLI spec: the settings list, the flags list, and the `TSCONFIG_UNREADABLE` row ("the tsconfig `tsConfigPath` names" instead of "`<baseDirectory>/tsconfig.json`");
  - the Destination Directory spec: the alias-import bullet.

  The shipped JSON Schema is regenerated from `configSchema`.

## Testing Decisions

- **Tests check external behaviour only:** the diagnostics a run returns (asserted by code and `file`, never by message wording), whether anything was written, and the emitted mirrored modules. How settings resolution or the ts-morph project is structured stays out of every assertion.
- **The programmatic entry point `compile()`, run against a fixture project, carries almost every case:**
  - The default `tsconfig.json` with `paths` still rewrites an alias import (the existing alias case stays green).
  - `tsConfigPath` in `pvlconfig.json` naming `tsconfig.app.json` rewrites an alias that only that file maps.
  - The `tsConfigPath` override beats the config file's value.
  - A relative `tsConfigPath` gives identical output from the config's directory and from an ancestor (`--config apps/web/pvlconfig.json`), following the existing relative-paths rule.
  - No tsconfig and no `tsConfigPath`: the run succeeds.
  - `TSCONFIG_UNREADABLE` when a named `tsConfigPath` doesn't exist, and when it names a directory, each with the resolved path as `file` and nothing written.
  - A `NodeNext` tsconfig: an import is rewritten to the file `NodeNext` resolves, where bundler resolution would pick a different one or none.
  - `moduleResolution` inherited through `extends` is respected.
  - A tsconfig that sets neither `module` nor `moduleResolution` falls back to bundler resolution, so an extension-less specifier still resolves.
  - A `.ts`-extension import resolves under a tsconfig that doesn't allow it itself.
  - A non-string `tsConfigPath` raises `INVALID_CONFIG`.
- **The CLI `runCli()`, kept thin:** `--ts-config-path` maps to the setting and wins over `pvlconfig.json`. The existing `TSCONFIG_UNREADABLE` row in `ERROR_CASES` gains a named file that's missing (exit code `1`, nothing written).
- **The inline snapshot of the shipped JSON Schema** picks up the new `tsConfigPath` key as a reviewed diff.
- **Prior art:** the `TSCONFIG_UNREADABLE` and alias-rewrite cases in the compiler's `compile()` tests, the `ERROR_CASES` table and the precedence tests in the CLI tests, and the JSON Schema snapshot test.

## Out of Scope

- Accepting a directory for `tsConfigPath` and searching it for a `tsconfig.json`, as `tsc -p` does.
- Searching parent directories for a tsconfig when none is in the base directory.
- Deriving pvl settings (such as `rootDir` or `include`) from the tsconfig.
- Using the tsconfig's `include`/`files` to choose which files are scanned.
- Typechecking the scanned files or the mirror against the tsconfig's other compiler options.
- A short alias such as `--tsconfig` for the flag.

## Further Notes

- The settled decisions came from a grilling session. The setting name `tsConfigPath`, the default `tsconfig.json`, the base-directory resolution, the file-only rule, the reuse of `TSCONFIG_UNREADABLE`, and the three-layer option merge were each chosen explicitly.
- The current behaviour lives in the mirror's ts-morph project, which always reads `<baseDirectory>/tsconfig.json` and spreads the bundler options over it. This spec replaces both the fixed path and the override order.
