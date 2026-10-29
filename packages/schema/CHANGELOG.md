# @pcvl/schema

## 0.1.0-next.0

### Minor Changes

- bc3a130: The first release. `@pcvl/schema` is a Zod-style schema-validation library; `@pcvl/compiler` is its ahead-of-time compiler and `pvl compile` CLI, which compiles primitive, literal, enum, object and array Schemas, nested and imported ones, and every Modifier. Both ship ESM and CJS builds with self-contained declarations (`.d.ts` and `.d.cts`) that reference only their real dependencies, and publishable manifests (license, repository, `exports`, `files`). `@pcvl/compiler` takes `@pcvl/schema` as a peer dependency of the same version.
