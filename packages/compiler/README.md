# @pcvl/compiler

The ahead-of-time compiler for [`@pcvl/schema`](https://www.npmjs.com/package/@pcvl/schema): it turns `pvl.compile(...)`-marked schemas into plain `if`/`for` validation code.

The library is PVL (Precompiled Validation Library); it is published under the `@pcvl` npm organization, so you install `@pcvl/compiler` and run the `pvl` CLI.

## Install

Install it as a devDependency, next to `@pcvl/schema`, its peer dependency:

```sh
npm install @pcvl/schema@next
npm install --save-dev @pcvl/compiler@next
```

Requires Node 22.19 or newer.

## Example

Mark a schema in `src/schemas/user.ts`:

```ts
import { pvl } from '@pcvl/schema';

export const user = pvl.compile(pvl.object({ name: pvl.string() }));
```

Add a `pvlconfig.json` (`{}` keeps the defaults) and compile:

```sh
pnpm exec pvl compile   # or: npx @pcvl/compiler compile
```

The compiled module lands in `.pvl/`, mirroring the source path, and exports the same names:

```ts
import { user } from '../.pvl/schemas/user.js';

user.validate({ name: 'Ada' });
```

## Links

- Documentation: [pvl-docs.vercel.app](https://pvl-docs.vercel.app)
- Wiki: [github.com/Ota-Prokopec/pvl/wiki](https://github.com/Ota-Prokopec/pvl/wiki)
