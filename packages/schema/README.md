# @pcvl/schema

A Zod-style schema-validation library whose schemas can be compiled ahead of time into plain `if`/`for` code.

The library is PVL (Precompiled Validation Library); it is published under the `@pcvl` npm organization, so you install `@pcvl/schema` and write `pvl` in your code.

## Install

```sh
npm install @pcvl/schema@next
```

## Example

```ts
import { pvl } from '@pcvl/schema';

const user = pvl.object({
  name: pvl.string().min(1),
  age: pvl.number().int().min(0),
});

const result = user.validate({ name: 'Ada', age: 36 });

if (result.issues) {
  console.log(result.issues);
} else {
  console.log(result.value);
}
```

To compile a schema ahead of time, mark it with `pvl.compile(...)` and run [`@pcvl/compiler`](https://www.npmjs.com/package/@pcvl/compiler).

## Links

- Documentation: [pvl-docs.vercel.app](https://pvl-docs.vercel.app)
- Wiki: [github.com/Ota-Prokopec/pvl/wiki](https://github.com/Ota-Prokopec/pvl/wiki)
