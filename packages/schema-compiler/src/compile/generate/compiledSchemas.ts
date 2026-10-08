// Finds every `pvl.compile(...)` call in a scanned module, reports the ones
// that can't be compiled, and rewrites the module so each call becomes an
// instance of its emitted Compiled Schema class.
import { Node, type CallExpression, type SourceFile } from 'ts-morph';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../../diagnostics/enums.js';
import type { ScannedModule } from '../mirror/scannedModule.js';
import { COMPILED_SCHEMA_IMPORT } from './consts.js';
import { emitCompiledSchema, findUncompilableReason } from './emitCompiledSchema.js';
import { readSchema, type ReadSchemaPayload } from './readSchema.js';
import type { SchemaModel } from './schemaModel.js';

/** The package `pvl` is imported from. */
const PVL_PACKAGE = '@pvl/schema' as const;

/** What can still be read off the result of `pvl.compile(...)`: the rest is a Modifier, a Constraint or a property it doesn't have. */
const COMPILED_SCHEMA_MEMBERS: ReadonlySet<string> = new Set(['validate']);

/** One `pvl.compile(...)` call that compiles. */
export type CompiledSchemaSite = {
  call: CallExpression;
  schema: SchemaModel;
};

/** Every compilable call in one module, with the diagnostics of those that aren't. */
export type ReadCompiledSchemasPayload = {
  diagnostics: Diagnostic[];
  sites: CompiledSchemaSite[];
};

// The local names `pvl` is imported under from `@pvl/schema`.
//
//   import { pvl } from '@pvl/schema';          // {'pvl'}
//   import { pvl as p } from '@pvl/schema';     // {'p'}
//   import { pvl } from './my-pvl.js';          // {}
const findPvlNames = (sourceFile: SourceFile): Set<string> => {
  return new Set(
    sourceFile
      .getImportDeclarations()
      .filter((declaration) => declaration.getModuleSpecifierValue() === PVL_PACKAGE)
      .flatMap((declaration) => declaration.getNamedImports())
      .filter((namedImport) => namedImport.getName() === 'pvl')
      .map((namedImport) => namedImport.getAliasNode()?.getText() ?? namedImport.getName()),
  );
};

// Every `pvl.compile(...)` call in `sourceFile`, in source order.
const findCompileCalls = (
  sourceFile: SourceFile,
  pvlNames: ReadonlySet<string>,
): CallExpression[] => {
  if (pvlNames.size === 0) {
    return [];
  }
  return sourceFile.getDescendants().filter((node): node is CallExpression => {
    if (!Node.isCallExpression(node)) {
      return false;
    }
    const callee = node.getExpression();
    return (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === 'compile' &&
      Node.isIdentifier(callee.getExpression()) &&
      pvlNames.has(callee.getExpression().getText())
    );
  });
};

// The member read off the result of `call`, when it isn't one a Compiled
// Schema has.
//
//   pvl.compile(user).optional()   // 'optional'
//   pvl.compile(user).validate(x)  // undefined
const findModifierOnResult = (call: CallExpression): string | undefined => {
  const parent = call.getParent();
  return Node.isPropertyAccessExpression(parent) &&
    parent.getExpression() === call &&
    !COMPILED_SCHEMA_MEMBERS.has(parent.getName())
    ? parent.getName()
    : undefined;
};

/**
 * Reads every `pvl.compile(...)` call in a scanned module, keeping the ones
 * that compile and reporting each one that doesn't with one error:
 *
 * - COMPILE_RESULT_MODIFIED: something is chained onto the result
 *   (`pvl.compile(user).optional()`).
 * - COMPILE_ARGUMENT_UNRESOLVABLE: the argument can't be read statically, as
 *   when it is imported, built by a function or spread.
 * - COMPILE_ARGUMENT_NOT_COMPOSITE, UNSUPPORTED_SCHEMA: see
 *   findUncompilableReason.
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
export const readCompiledSchemas = ({
  path,
  sourceFile,
}: ScannedModule): ReadCompiledSchemasPayload => {
  const diagnostics: Diagnostic[] = [];
  const sites: CompiledSchemaSite[] = [];
  const pvlNames = findPvlNames(sourceFile);

  for (const call of findCompileCalls(sourceFile, pvlNames)) {
    const line = call.getStartLineNumber();
    const modifierName = findModifierOnResult(call);
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
    const readSchemaPayload: ReadSchemaPayload =
      argument === undefined || !Node.isExpression(argument)
        ? { unresolvedNode: call }
        : readSchema({ expression: argument, sourceFile, pvlNames });
    if ('unresolvedNode' in readSchemaPayload) {
      const { unresolvedNode } = readSchemaPayload;
      diagnostics.push(
        createDiagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
          message: `The argument of pvl.compile() on line ${String(line)} can't be read statically: \`${unresolvedNode.getText()}\` on line ${String(unresolvedNode.getStartLineNumber())} isn't a pvl Schema, a literal or a const of this file holding one.`,
          file: path,
        }),
      );
      continue;
    }
    const reason = findUncompilableReason(readSchemaPayload.schema);
    if (reason !== undefined) {
      diagnostics.push(createDiagnostic({ ...reason, file: path }));
      continue;
    }
    sites.push({ call, schema: readSchemaPayload.schema });
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
  sites: ReadonlyArray<CompiledSchemaSite>,
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
