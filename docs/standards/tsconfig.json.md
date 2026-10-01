# tsconfig.json

## Core Rules

- Every `tsconfig.json` extends one of the predefined base configs in [`packages/typescript-config`](../../packages/typescript-config/) rather than restating compiler options.
- Use this scaffold as the reference for a new `tsconfig.json`, adapted to the app or package:

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
