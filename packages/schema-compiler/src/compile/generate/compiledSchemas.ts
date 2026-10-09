// Finds every `pvl.compile(...)` call in a scanned module, reports the ones
// that can't be compiled, and rewrites the module so each call becomes an
// instance of its emitted Compiled Schema class.
import { Node, type CallExpression, type SourceFile } from 'ts-morph';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../../diagnostics/enums.js';
import type { ScannedModule } from '../mirror/scannedModule.js';
import { COMPILED_SCHEMA_IMPORT } from './consts.js';
import { emitCompiledSchema, findUncompilableDiagnostics } from './emitCompiledSchema.js';
import { readSchema } from './readSchema.js';
import type { SchemaModel } from './schemaModel.js';

/** The package `pvl` is imported from. */
const PVL_PACKAGE = '@pvl/schema' as const;

/** The methods that may still be read off the result of `pvl.compile(...)`. Anything else read off it is a Modifier, a Constraint or a property a Compiled Schema doesn't have, reported as COMPILE_RESULT_MODIFIED. */
const COMPILE_MARKER_ALLOWED_METHODS: ReadonlySet<string> = new Set(['validate']);

/** One Compile-Marked Schema that compiles: its `pvl.compile(...)` call and the Schema read from it. */
export type CompileMarkedSchemaSite = {
  call: CallExpression;
  schema: SchemaModel;
};

/** Every compilable call in one module, with the diagnostics of those that aren't. */
export type ReadCompileMarkedSchemasPayload = {
  diagnostics: Diagnostic[];
  sites: CompileMarkedSchemaSite[];
};

/**
 * The Local Names `pvl` is imported under in `sourceFile`: one per named
 * import whose Module Specifier is `@pvl/schema` and whose Import Name is
 * `pvl`. An empty set means the module has no `pvl` to read.
 *
 * ```ts
 * import { pvl } from '@pvl/schema';              // {'pvl'}
 * import { pvl as p } from '@pvl/schema';         // {'p'}
 * import { pvl as p, pvl } from '@pvl/schema';    // {'p', 'pvl'}
 * import { pvl } from './my-pvl.js';              // {}: Module Specifier isn't `@pvl/schema`
 * import { z } from '@pvl/schema';                // {}: Import Name isn't `pvl`
 * import * as schema from '@pvl/schema';          // {}: not a named import
 * ```
 */
const findPvlImportLocalNames = (sourceFile: SourceFile): Set<string> => {
  return new Set(
    sourceFile
      .getImportDeclarations()
      .filter((declaration) => declaration.getModuleSpecifierValue() === PVL_PACKAGE)
      .flatMap((declaration) => declaration.getNamedImports())
      .filter((namedImport) => namedImport.getName() === 'pvl')
      .map((namedImport) => namedImport.getAliasNode()?.getText() ?? namedImport.getName()),
  );
};

/**
 * The `pvl.compile(...)` calls in `sourceFile` as an array of their syntax
 * nodes (`CallExpression`), wherever they are nested, in source order. Each
 * node is the whole call, not the Schema inside it, so a caller can both read
 * its argument and replace the call. A call counts when it is
 * `<name>.compile(…)` and `<name>` is one of `pvlImportLocalNames`, the Local
 * Names `pvl` is imported under. A nested call follows the call around it.
 * Empty when no call matches or the module imports no `pvl`.
 *
 * ```ts
 * // pvlImportLocalNames: {'pvl'}
 * pvl.compile(pvl.string())     // [pvl.compile(pvl.string()) ]
 * export const user = pvl.compile(userSchema); // [pvl.compile(...)], at any depth
 * pvl.compile(pvl.compile(x))   // [outer call, inner call]
 * pvl.string()                  // []: not `compile`
 * schemas.compile(pvl.string()) // []: `schemas` isn't a Local Name of `pvl`
 * pvl.compile                   // []: not called
 *
 * // pvlImportLocalNames: {}
 * pvl.compile(pvl.string())     // []: the module imports no `pvl`
 * ```
 */
const findCompileCalls = (
  sourceFile: SourceFile,
  pvlImportLocalNames: ReadonlySet<string>,
): CallExpression[] => {
  // Without a `pvl` import there is nothing to find, so skip the walk.
  if (pvlImportLocalNames.size === 0) {
    return [];
  }

  // `getDescendants()` is every node of the file's syntax tree, not just
  // statements: each statement, expression, identifier and token, at any depth,
  // parents before their children, so in source order.
  return sourceFile.getDescendants().filter((node): node is CallExpression => {
    // `node` is the one tree node being tested. Most are not calls (`pvl`,
    // `.compile`, `'a'`, `const user = …`), and are dropped here.
    if (!Node.isCallExpression(node)) {
      return false;
    }

    // `callee` is what `node` calls, the part before the parentheses: for
    // `pvl.compile(pvl.string())` it is `pvl.compile`. It must be a property
    // access, `<receiver>.compile`, with a Local Name of `pvl` as the receiver.
    const callee = node.getExpression();
    return (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === 'compile' &&
      Node.isIdentifier(callee.getExpression()) &&
      pvlImportLocalNames.has(callee.getExpression().getText())
    );
  });
};

/**
 * The name of the member read off the result of the `pvl.compile(...)` call
 * `call`, when a Compiled Schema doesn't have it, so the module chains a
 * Modifier, a Constraint or an unknown property onto it. `undefined` when
 * nothing is read off the result, or only `validate`.
 *
 * ```ts
 * pvl.compile(user).optional()      // 'optional'
 * pvl.compile(tags).min(1)          // 'min'
 * pvl.compile(user).shape           // 'shape': read, even when not called
 * pvl.compile(user).validate(input) // undefined: a Compiled Schema has it
 * pvl.compile(user)                 // undefined: nothing read off it
 * pvl.compile(user)['optional']()   // undefined: an element access isn't checked
 * ```
 */
const findModifierOnCompileMarker = (call: CallExpression): string | undefined => {
  const parent = call.getParent();

  return Node.isPropertyAccessExpression(parent) &&
    parent.getExpression() === call &&
    !COMPILE_MARKER_ALLOWED_METHODS.has(parent.getName())
    ? parent.getName()
    : undefined;
};

/**
 * Reads every Compile-Marked Schema in a scanned module, one per
 * `pvl.compile(...)` call, keeping the ones that compile and reporting each
 * one that doesn't with its errors:
 *
 * - COMPILE_RESULT_MODIFIED: something is chained onto the result
 *   (`pvl.compile(user).optional()`).
 * - COMPILE_ARGUMENT_UNRESOLVABLE: the argument can't be read statically, as
 *   when it is imported, built by a function or spread.
 * - COMPILE_ARGUMENT_NOT_COMPOSITE, UNSUPPORTED_SCHEMA: see
 *   findUncompilableDiagnostics, one error per problem.
 *
 * ```ts
 * import { pvl } from '@pvl/schema';
 * import { address } from './address.js';
 * export const user = pvl.compile(pvl.object({ name: pvl.string() })); // a site
 * export const home = pvl.compile(address);                            // COMPILE_ARGUMENT_UNRESOLVABLE
 * ```
 *
 * A module that doesn't import `pvl` from `@pvl/schema` has no call to read.
 */
export const readCompileMarkedSchemas = ({
  path,
  sourceFile,
}: ScannedModule): ReadCompileMarkedSchemasPayload => {
  const diagnostics: Diagnostic[] = [];
  const sites: CompileMarkedSchemaSite[] = [];
  const pvlImportLocalNames = findPvlImportLocalNames(sourceFile);

  for (const call of findCompileCalls(sourceFile, pvlImportLocalNames)) {
    const line = call.getStartLineNumber();
    const modifierName = findModifierOnCompileMarker(call);

    if (modifierName !== undefined) {
      diagnostics.push(
        createDiagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_RESULT_MODIFIED,
          message: `\`.${modifierName}\` is chained onto the result of pvl.compile() on line ${String(line)}, which is a plain Schema. Chain it inside: pvl.compile(schema.${modifierName}(…)).`,
          file: path,
        }),
      );
      continue;
    }

    const [argument] = call.getArguments();

    const schemaPayload =
      argument === undefined || !Node.isExpression(argument)
        ? { unresolvedNode: call }
        : readSchema({ expression: argument, sourceFile, pvlImportLocalNames });

    if ('unresolvedNode' in schemaPayload) {
      diagnostics.push(
        createDiagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
          message: `The argument of pvl.compile() on line ${String(line)} can't be read statically: \`${schemaPayload.unresolvedNode.getText()}\` on line ${String(schemaPayload.unresolvedNode.getStartLineNumber())} isn't a pvl Schema, a literal or a const of this file holding one.`,
          file: path,
        }),
      );
      continue;
    }

    const uncompilableDiagnostics = findUncompilableDiagnostics(schemaPayload.schema);
    if (uncompilableDiagnostics.length > 0) {
      diagnostics.push(
        ...uncompilableDiagnostics.map((diagnostic) => ({ ...diagnostic, file: path })),
      );
      continue;
    }

    sites.push({ call, schema: schemaPayload.schema });
  }
  return { diagnostics, sites };
};

/** The class name of a module's `index`th Compiled Schema, counted in source order. */
const toCompiledSchemaClassName = (index: number): string => `PvlCompiledSchema${String(index)}`;

/**
 * Rewrites, in place, the module holding `sites`: each `pvl.compile(...)`
 * call becomes `new PvlCompiledSchema<n>()`, and the classes go right after
 * the module's imports, under one import of what they extend.
 *
 * ```ts
 * import { pvl } from '@pvl/schema';
 * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
 * // ↓
 * import { pvl } from '@pvl/schema';
 * import { Schema as PvlSchema, … } from '@pvl/schema';
 *
 * // pvl.compile() on line 2
 * class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> { … }
 *
 * export const user = new PvlCompiledSchema0();
 * ```
 *
 * Does nothing when `sites` is empty.
 */
export const applyCompiledSchemas = (
  sourceFile: SourceFile,
  sites: ReadonlyArray<CompileMarkedSchemaSite>,
): void => {
  if (sites.length === 0) {
    return;
  }
  const classDeclarations = sites.map(({ call, schema }, index) =>
    emitCompiledSchema({
      schema,
      className: toCompiledSchemaClassName(index),
      line: call.getStartLineNumber(),
    }),
  );
  // Last first, so replacing one call leaves the earlier ones where they were.
  for (const [index, { call }] of [...sites.entries()].reverse()) {
    call.replaceWithText(`new ${toCompiledSchemaClassName(index)}()`);
  }
  const importCount = sourceFile
    .getStatements()
    .reduce(
      (count, statement, index) => (Node.isImportDeclaration(statement) ? index + 1 : count),
      0,
    );
  sourceFile.insertStatements(
    importCount,
    [COMPILED_SCHEMA_IMPORT, '', classDeclarations.join('\n\n')].join('\n'),
  );
};
