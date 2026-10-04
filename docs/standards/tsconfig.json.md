# tsconfig.json

Use this scaffold as the reference for a new `tsconfig.json`, adapted to the app or package. Don't restate compiler options the base already sets.

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
