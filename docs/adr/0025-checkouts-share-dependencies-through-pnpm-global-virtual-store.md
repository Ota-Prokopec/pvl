# Every checkout shares its external dependencies through pnpm's global virtual store

`pnpm-workspace.yaml` sets `enableGlobalVirtualStore: true`, so every checkout's `node_modules` links its external packages from one shared store, while `@repo/*` and `@pcvl/*` still link to the checkout's own sources. A new worktree's install drops from ~5s at full CPU to ~2s, at almost no disk cost. `pnpm store prune` cleans the store by hand.

Rejected: symlinking a worktree's `node_modules` to the main checkout's. The relative workspace links would resolve to main's sources, and every branch would share one dependency set.
