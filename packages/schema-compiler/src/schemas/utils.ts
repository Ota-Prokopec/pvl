// The diagnostics `Schema.findUncompilableDiagnostics` reports: a Schema
// with no Emitter, and a method chained onto it that can't be compiled; and
// the hint `readSchema` adds to COMPILE_ARGUMENT_UNRESOLVABLE for an import
// the compiler doesn't follow.
import type { PvlFactoryName } from '@pvl/schema';
import type { CallExpression, Node } from 'ts-morph';
import { GenericAst } from '../ast/genericAst.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import type { Emitter } from '../emitters/emitter.js';
import type { Module } from '../module/module.js';
import type { SchemaModifierCall } from './types/modifierCall.js';

/** What {@link createUnsupportedSchemaDiagnostic} reports: a Schema's factory, its call, and the Module whose Schema it is. */
export type CreateUnsupportedSchemaDiagnosticArgs = {
  factory: PvlFactoryName;
  factoryCall: CallExpression;
  module: Module;
};

/**
 * The UNSUPPORTED_SCHEMA diagnostic of a Schema with no Emitter yet.
 *
 * ```ts
 * createUnsupportedSchemaDiagnostic({ factory: 'union', factoryCall: <pvl.union([…])>, module }) // UNSUPPORTED_SCHEMA: 'The `pvl.union()` on line 3 can't be compiled yet.'
 * ```
 */
export const createUnsupportedSchemaDiagnostic = ({
  factory,
  factoryCall,
  module,
}: CreateUnsupportedSchemaDiagnosticArgs): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
    message: `The \`pvl.${factory}()\` on ${module.spellLocation(factoryCall)} can't be compiled yet.`,
    file: module.path.absolutePath,
  });
};

/** What {@link findUncompilableCallDiagnostic} checks: a method chained onto a Schema, the Emitter compiling that Schema, and the Module whose Schema it is. */
export type FindUncompilableCallDiagnosticArgs = {
  emitter: typeof Emitter;
  call: SchemaModifierCall;
  module: Module;
};

/**
 * The diagnostic for a method chained onto a Schema, if it can't be
 * compiled: `emitter` has no method for it, or one of its arguments is
 * spread.
 *
 * ```ts
 * .min(3) on a string                  // undefined
 * .min(MIN_FROM_IMPORT) on a string    // undefined: a Runtime Argument
 * .optional() on the root object       // undefined
 * .refine(isOk) on a string            // undefined: a Runtime Argument
 * .strict() on a string                // UNSUPPORTED_SCHEMA: an object's method
 * .min(...limits) on a string          // COMPILE_ARGUMENT_UNRESOLVABLE
 * ```
 */
export const findUncompilableCallDiagnostic = ({
  emitter,
  call,
  module,
}: FindUncompilableCallDiagnosticArgs): Diagnostic | undefined => {
  if (!emitter.compilesMethod({ name: call.name })) {
    return new Diagnostic({
      code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
      message: `\`.${call.name}()\` on ${module.spellLocation(call.methodCall)} can't be compiled yet.`,
      file: module.path.absolutePath,
    });
  }
  return call.args === undefined
    ? new Diagnostic({
        code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        message: `An argument of \`.${call.name}()\` on ${module.spellLocation(call.methodCall)} is spread, so it has no fixed position for the Compiled Schema to pass it at.`,
        file: module.path.absolutePath,
      })
    : undefined;
};

/**
 * How to write `unresolvedNode` so it is followed, when it reads an Imported
 * Schema in a way the compiler doesn't follow (ADR-0043): a name bound to a
 * default-exported expression, which no `const` holds, or a property of a
 * namespace import, which is no name of its own; `undefined` for anything
 * else. Where it names a line, it names it as a diagnostic on `module` does.
 *
 * ```ts
 * // import user from './user.js', where line 3 of user.ts is `export default pvl.object(…);`
 * findImportHint(<user>, module)
 * // '`user` is a default-exported expression on line 3 of user.ts, which the compiler doesn't follow. A default export is followed when it names a `const`: …'
 * // import * as schemas from './schemas.js';
 * findImportHint(<schemas.user>, module) // "Import the Schema by its name instead: `import { user } from './schemas.js'`."
 * findImportHint(<makeSchema()>, module) // undefined
 * ```
 */
export const findImportHint = (unresolvedNode: Node, module: Module): string | undefined => {
  const defaultExport = GenericAst.findBoundDefaultExport(unresolvedNode);
  if (defaultExport !== undefined) {
    const name = unresolvedNode.getText();
    return `\`${name}\` is a default-exported expression on ${module.spellLocation(defaultExport)}, which the compiler doesn't follow. A default export is followed when it names a \`const\`: \`const ${name} = pvl.object(…); export default ${name};\`.`;
  }
  const namespaceImportRead = GenericAst.asNamespaceImportRead(unresolvedNode);
  return namespaceImportRead === undefined
    ? undefined
    : `Import the Schema by its name instead: \`import { ${namespaceImportRead.propertyName} } from '${namespaceImportRead.moduleSpecifier}'\`.`;
};
