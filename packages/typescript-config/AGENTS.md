# `@repo/typescript-config`

The shared tsconfig base. Every `tsconfig*.json` in the repo extends `@repo/typescript-config/base.json` (or a sibling tsconfig that does), and lint enforces that. `base.json` holds the strict compiler options every entry shares. An entry's own tsconfig adds only what's specific to it, with a comment saying why.

Add a second base only when several entries share options that `base.json` mustn't have.
