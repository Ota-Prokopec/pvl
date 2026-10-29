# The packages are published under the `@pcvl` npm organization, while the library stays PVL

**PVL is published to npm as `@pcvl/schema` and `@pcvl/compiler`. `pcvl` (PreCompiled Validation Library) names the npm organization only: the library, its API, CLI, config file, Destination Directory and docs stay PVL ([#194](https://github.com/Ota-Prokopec/pvl/issues/194)).**

- The names the project used, `@pvl/schema` and `@pvl/schema-compiler`, can never be published: the `@pvl` npm scope is held by an inactive user account (`~pvl`, no packages). The maintainer chose not to dispute it.
- The maintainer owns the `@pcvl` npm organization, and nothing was ever published under it or under the old names.
- The compiler is `@pcvl/compiler` rather than `@pcvl/schema-compiler`, and its workspace folder (`packages/compiler`) and spec folder (`docs/specification/compiler/`) follow the package name.

## Consequences

- Only what names a package changes. The `pvl` export, the `pvl` bin, `pvlconfig.json`, the `.pvl` Destination Directory and its `.pvl-generated`, `.pvl-tmp` and `.pvl-old` folders, the `Pvl`/`PVL_` types and generated-code aliases, the docs site domain, the thesis and the GitHub repository `Ota-Prokopec/pvl` keep their names.
- The compiler recognises `pvl` only from the Module Specifier `@pcvl/schema`. An import from `@pvl/schema` is ignored like any non-PVL import: there is no compatibility alias, as nothing was ever published under the old name.
- The generated header names `@pcvl/compiler`, generated code imports its types from `@pcvl/schema`, and every Schema reports the Standard Schema `vendor` `'@pcvl/schema'`, the npm package name ([ADR-0003](./0003-compiled-schemas-conform-to-standard-schema.md), [ADR-0029](./0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md)).
- A user sees `@pcvl` in the install command and `pvl` in the code, so the glossary and each package's README say the library is published under the `@pcvl` npm organization.

## Considered options

- **Dispute the `@pvl` scope with npm.** Rejected: the outcome and its timing are uncertain, and publishing shouldn't wait on it.
- **Rename the library to PCVL to match the scope.** Rejected: it renames the API, CLI, config file, Destination Directory and every document for a registry detail.
