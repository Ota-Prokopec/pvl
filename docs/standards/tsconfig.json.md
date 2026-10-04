# tsconfig.json

Start a new `tsconfig.json` from this scaffold, adapted to the app or package. The base sets every shared compiler option, so the file adds only what differs.

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
