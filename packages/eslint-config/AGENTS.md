# `@repo/eslint-config`

The shared ESLint presets. Every workspace entry takes the package as a `workspace:*` devDependency and re-exports a preset from its own `eslint.config.ts`. Two presets, both TypeScript loaded through jiti:

- **`base`** (`src/base.ts`) is what each entry's `lint` script runs over its TypeScript. It wires typescript-eslint (syntax only, no type information), the core `no-restricted-syntax` selectors, and the [`@repo/conventions`](../conventions/AGENTS.md) rules. `@pvl/schema` adds its own TSDoc and no-regex rules on top.
- **`workspace`** (`src/workspace.ts`) is what the root `lint:workspace` task runs. It covers every `package.json`, `tsconfig*.json`, `AGENTS.md` and JavaScript file in the repo, through `@eslint/json`, `@eslint/markdown` and `@repo/conventions`.

`linterOptions.noInlineConfig` is on in both. An exception is a file-scoped override in the entry's `eslint.config.ts`, never a disable comment.

ESLint 10 looks up the config file from each linted file's directory. That's why the root task passes `--config eslint.config.ts`: without it, files inside an entry would pick up that entry's `base` config instead.
