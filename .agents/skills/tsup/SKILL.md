---
name: tsup
description: How to use tsup — zero-config TypeScript bundler powered by esbuild. Use when bundling TypeScript packages or configuring build output.
category: development
risk: safe
source: local
tags: [tsup, esbuild, bundler, typescript, build]
tools: [claude, cursor, gemini, antigravity, copilot, windsurf, kiro]
date_added: "2026-03-28"
metadata:
  version: "1.0.0"
---

# tsup

Zero-config TypeScript/JavaScript bundler powered by esbuild. Outputs CJS, ESM, and declaration files.

> **Source:** [github.com/egoist/tsup](https://github.com/egoist/tsup) · [npm](https://www.npmjs.com/package/tsup)
> **Version in project:** `8.5.1` · **Published:** 2025-03 · **Skill updated:** 2026-03-21

## When to Use

- Creating or modifying `tsup.config.ts` for a package
- Configuring dual CJS/ESM output or DTS generation
- Debugging build issues (TS2589 with dts, externals, shims)

## When NOT to Use

- Running builds across the monorepo (use `turborepo` skill)
- Compiling into standalone binaries (use `yao-pkg` skill)

## Installation

```bash
npm install tsup -D
```

## Basic Config

Create `tsup.config.ts` at the package root:

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  target: "es2022",
  sourcemap: true,
});
```

## Key Options

| Option       | Type                            | Default               | Description                                    |                                    |                |
| ------------ | ------------------------------- | --------------------- | ---------------------------------------------- | ---------------------------------- | -------------- |
| `entry`      | `string[]`                      | —                     | Entry point files                              |                                    |                |
| `format`     | `("cjs" \                       | "esm" \               | "iife")[]`                                     | `["cjs"]`                          | Output formats |
| `dts`        | `boolean \                      | { resolve: boolean }` | `false`                                        | Generate `.d.ts` declaration files |                |
| `clean`      | `boolean`                       | `false`               | Clean `outDir` before build                    |                                    |                |
| `outDir`     | `string`                        | `"dist"`              | Output directory                               |                                    |                |
| `target`     | `string`                        | —                     | JS target (`"es2020"`, `"es2022"`, `"node18"`) |                                    |                |
| `sourcemap`  | `boolean \                      | "inline"`             | `false`                                        | Generate source maps               |                |
| `minify`     | `boolean`                       | `false`               | Minify output                                  |                                    |                |
| `splitting`  | `boolean`                       | `false`               | Code splitting (ESM only)                      |                                    |                |
| `treeshake`  | `boolean`                       | `false`               | Tree shaking (uses rollup)                     |                                    |                |
| `external`   | `string[]`                      | —                     | Externalize packages (not bundled)             |                                    |                |
| `noExternal` | `string[]`                      | —                     | Force bundle these packages                    |                                    |                |
| `banner`     | `{ js?: string; css?: string }` | —                     | Prepend text to output                         |                                    |                |
| `footer`     | `{ js?: string; css?: string }` | —                     | Append text to output                          |                                    |                |
| `onSuccess`  | `string \                       | (() => void)`         | —                                              | Run after successful build         |                |
| `watch`      | `boolean`                       | `false`               | Watch mode                                     |                                    |                |
| `env`        | `Record<string, string>`        | —                     | Define `process.env.*` replacements            |                                    |                |
| `define`     | `Record<string, string>`        | —                     | Define compile-time constants                  |                                    |                |
| `shims`      | `boolean`                       | `false`               | Inject CJS/ESM interop shims                   |                                    |                |

## Multiple Entry Points

```typescript
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["cjs", "esm"],
});
// Output: dist/index.js, dist/cli.js, dist/index.mjs, dist/cli.mjs
```

## Multiple Configs

```typescript
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    dts: false,
  },
]);
```

## External Dependencies

By default, tsup bundles everything. For libraries, externalize dependencies:

```typescript
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  // Don't bundle these — users install them separately
  external: ["convict", "dotenv", "js-yaml"],
});
```

> **Tip:** tsup auto-externalizes packages listed in `dependencies` and `peerDependencies` in `package.json`. You rarely need to specify `external` manually.

## package.json Scripts

```json
{
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  }
}
```

## package.json Exports (Dual CJS/ESM)

```json
{
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      }
    }
  },
  "files": ["dist"]
}
```

## Watch Mode

```bash
tsup --watch
tsup src/index.ts --watch --onSuccess "node dist/index.js"
```

## Environment Variables

```typescript
export default defineConfig({
  env: {
    NODE_ENV: "production",
  },
  // or use define for arbitrary replacements
  define: {
    "process.env.VERSION": JSON.stringify("1.0.0"),
  },
});
```

---

## ⚠️ Gotchas

### DTS generation is slow

`dts: true` uses the TypeScript compiler (not esbuild) to generate `.d.ts` files. This is **much slower** than the JS bundle. For large projects:

```typescript
export default defineConfig({
  dts: {
    // Only resolve types from these packages
    resolve: true,
  },
});
```

### TS2589 with convict and dts

When `dts: true` is enabled, TypeScript generates declaration files. Libraries with deeply recursive types (like convict's `Path<T>`) trigger "Type instantiation is excessively deep" (TS2589). This **only** happens during dts generation, not regular typecheck.

**Fix:** Use `@ts-ignore` before problematic calls, or use simplified interface types for exported function parameters.

### CJS vs ESM file extensions

| Format | JS extension | DTS extension |
| ------ | ------------ | ------------- |
| `cjs`  | `.js`        | `.d.ts`       |
| `esm`  | `.mjs`       | `.d.mts`      |

When `format: ["cjs", "esm"]`, tsup produces **both** `index.js` (CJS) and `index.mjs` (ESM).

### External auto-detection

tsup reads `package.json` and auto-externalizes:

- `dependencies`
- `peerDependencies`

It does **NOT** auto-externalize:

- `devDependencies`
- `optionalDependencies`

### Clean removes entire outDir

`clean: true` deletes the entire `dist/` folder before build. If you have non-tsup files in `dist/`, they will be deleted.

### Shims for CJS/ESM interop

If your ESM code uses `__dirname` or `__filename` (CJS-only globals), enable shims:

```typescript
export default defineConfig({
  shims: true, // Injects import.meta.url polyfill for CJS
});
```

### Tree shaking requires rollup

`treeshake: true` switches from esbuild to rollup for tree shaking, which is slower but more thorough. Only use when needed.
