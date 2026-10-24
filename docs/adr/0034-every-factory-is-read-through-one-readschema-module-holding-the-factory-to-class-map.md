# Every factory is read through one `readSchema` module, which holds the factory-to-class map

**`src/schemas/readSchema.ts` holds the map from each `pvl.*` factory to the Schema subclass reading it, as a `const`, and exports `readSchema`, the one entry point that reads a Schema.** It imports the abstract `Schema` and every subclass. This amends [ADR-0026](./0026-the-compiler-reads-each-factory-into-its-own-schema-subclass.md), whose map each subclass filled from its own static block (`Schema.registerClass(StringSchema)`), once `module.ts` imported `src/schemas/index.js` for that side effect alone.

```ts
const SCHEMA_CLASS_BY_FACTORY = {
  [SCHEMA_FACTORY.STRING]: StringSchema,
  …
  [SCHEMA_FACTORY.UNION]: UnionSchema,
} satisfies { readonly [Factory in SchemaFactory]: SchemaClass & { readonly factory: Factory } };
```

Self-registration had three problems. Forgetting the import was a runtime error ("load src/schemas/ before reading a Schema"), raised only once a Schema was read. `SCHEMA_FACTORIES` repeated the registry's keys to tell a factory from another method of `pvl`. And whether every factory had a subclass was known only at runtime. ADR-0026 rejected holding the map in `schema.ts`, which is an import cycle, and in the barrel, which only re-exports, but not a module of its own:

- **It has no cycle.** `schema.ts` never imports `readSchema.ts`, and a subclass reads the Schemas nested in it through the `readNested` callback it is handed, so no subclass imports it either. The cycle ADR-0026 avoided came from the map living in `schema.ts`, which every subclass extends. Only `module.ts` imports `readSchema.ts`, so it loads after every subclass.
- **The map is checked by its type.** `satisfies` requires a subclass for every `SchemaFactory`, each with its own key as its `factory`, so a missing or misfiled subclass is a type error, and no factory can be left without one at runtime. `isSchemaFactory` reads the map's own keys (`Object.hasOwn`), so `SCHEMA_FACTORIES` is gone, and a name every object has (`toString`) is no factory.
- **`schema.ts` holds only the abstract class**: what every Schema holds, its diagnostics, its compiling, its children and its Runtime Arguments, plus `readArgument`, which a subclass reads its factory's argument with.

**The reading order is written in one place.** `readExpression` reads a Schema in the order it is written: its factory's argument, through its subclass's `readFactoryArgument`, with every Schema nested in it, then the methods chained onto the call, in chain order, those chained onto a `pvl.compile(…)` it is read through coming after its own. `readFactoryArgument(link, { readNested })` reads only what its own type needs, and returns how its Schema is built from what every Schema holds (`(options: SchemaOptions) => ArraySchema`). `readExpression` calls that once it has read the calls. Before, the subclass's `fromFactory` built its Schema itself and was handed lazy `readCalls`/`readOuterCalls` closures, which it had to call after reading its argument, so each subclass kept the order. It is renamed `readFactoryArgument` for what it now does. No closure defers reading the methods any more, but they are still read after the factory's argument, not before it, for the reason below.

```ts
const buildSchema = schemaClass.readFactoryArgument(factory, { readNested });
// Read once the factory's argument is, as they are written after it.
const calls = chainedMethods.map((method) => readMethodCall(method, args.runtimeArguments));
return buildSchema({ module, expression, line, preModifierCalls, postModifierCalls });
```

The order decides one thing. Runtime Arguments are numbered as they are read, and their numbers are the order of the Compiled Schema's constructor parameters, so they must be the order the interpreted path evaluates them in ([ADR-0030](./0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md)): `pvl.object({ name: pvl.string().max(max) }).strict(options)` passes `max` before `options`. Which error wins no longer depends on it. Since ADR-0030, reading a method's argument never fails: one that isn't a literal is a Runtime Argument, and a spread one is carried as `args: undefined`, which `findUncompilableDiagnostics` reports once the Schema has been read. So a factory's argument that can't be read is the one diagnostic of its call, whatever is chained onto it.

The emitted output and every diagnostic are unchanged.

## Considered options

- **Keep the static blocks, and import `src/schemas/` wherever a Schema is read.** Rejected: the side-effect import is what can be forgotten, and the keys stay repeated.
- **Read the methods before the factory's argument, and number the Runtime Arguments in written order afterwards.** Rejected: a Runtime Argument's number is fixed when it is made, as its field (`arg0`) and every check reading it are named after it. Numbering afterwards would need the read tree rebuilt, or a number set on an argument after it is made.
- **Hand `readFactoryArgument` the chained methods unread, for it to read once it has read its argument.** Rejected: no closure, but each subclass would still keep the order.
- **`readFactoryArgument` returns what it read as data, which `readSchema` passes to a static `create` of the same subclass.** Rejected: that data's type differs per subclass, so calling `create` with what `readFactoryArgument` returned, through a map of every subclass, doesn't type-check without a cast or a wrapper per entry.
