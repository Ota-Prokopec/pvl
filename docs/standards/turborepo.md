# Turborepo

Turborepo is a high-performance build system for JavaScript and TypeScript monorepos that optimizes caching and task execution. Always use your web fetching tool to read the complete markdown documentation at this URL whenever you work with Turborepo: [Turborepo Docs](https://turborepo.dev/llms.txt)

## Core Rules

- **Never chain multi-step package.json scripts with shell `&&`.** When a script (`build`, `dev`, or any other task Turborepo invokes) needs to run more than one step — e.g. generating a file before bundling it — use [`npm-run-all`](https://github.com/mysticatea/npm-run-all)'s `run-s` (sequential) or `run-p` (parallel) instead of `&&`/`&`. Add `npm-run-all` to the package's own `devDependencies`, not just the root.
  - Split each step into its own named script, then compose them:
    ```json
    {
      "scripts": {
        "build": "run-s generate:openapi build:bundle",
        "build:bundle": "tsup",
        "generate:openapi": "tsx src/scripts/generate-openapi.ts"
      }
    }
    ```
  - Reason: `&&` chains are shell-specific (fragile across Windows/CI shells), don't compose with Turborepo's task graph as cleanly, and hide the individual steps from `pnpm run` script listings. Named steps run via `run-s`/`run-p` stay independently invocable and show up individually.
