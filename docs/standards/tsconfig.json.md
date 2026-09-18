# tsconfig.json

## Core Rules

- Use predefined base configs to extend all tsconfigs - See [packages/typescript-config/AGENTS.md](../../packages/typescript-config/AGENTS.md)

* **Use this tsconfig scaffold as a reference when creating a new `tsconfig.json` file. Adapt it as needed for the specific app or package.**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```
