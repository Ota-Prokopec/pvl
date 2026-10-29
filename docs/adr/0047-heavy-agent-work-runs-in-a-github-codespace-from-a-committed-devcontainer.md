# Heavy agent work runs in a GitHub Codespace from a committed devcontainer

The local development machine has 8 GB of RAM, and `/implement-spec` with two implementers already fills it. So `.devcontainer/devcontainer.json` defines a second development environment, and `pnpm claude --codespace` starts Claude Code in a GitHub Codespace of the repo on a 4-core, 16 GB machine, opened in a new VS Code window as a local worktree is. There, `/implement-spec` runs 3 implementers instead of 2.

- **One codespace per branch.** The codespace takes the place of a worktree: a new one is created on `main` and switched to the new `<type>/<slug>` branch inside it, so nothing reaches `origin` before the first push.
- **The devcontainer holds the project's toolchain only:** Node 24, pnpm through corepack, `pnpm install` (which installs lefthook), Claude Code and the SSH server `gh codespace ssh` needs. Personal Claude Code settings, plugins and skills come from the developer's dotfiles repo, which Codespaces installs into every codespace, and VS Code settings and extensions from Settings Sync.
- **The quota is the limit.** The student allowance is 180 core-hours a month, about 45 hours of a 4-core machine, so every codespace is created with a 30-minute idle timeout and a 7-day retention period. There are no prebuilds, which would spend Actions minutes and storage to save a few minutes per new codespace.
- **Claude Code logs in by hand** on the first run in each codespace; no token is stored as a Codespaces secret.

`pnpm test` also runs the packages' suites one at a time (`turbo run test --concurrency=1`), locally and in a codespace, since three vitest runs at once each start a worker per core.

## Considered options

- **One long-lived codespace with worktrees inside it.** Rejected: its sessions would share one 16 GB machine again.
- **Claude Code on the web (`claude --remote`).** Rejected: it gives no VS Code window and no interactive terminal. The script's flag is named `--codespace` so that `claude`'s own `--remote` still passes through.
- **Fewer implementers locally.** Not enough on its own: one is half the throughput, and the tests are what fill the memory.
