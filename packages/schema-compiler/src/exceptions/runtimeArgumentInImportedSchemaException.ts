// The exception reading a Schema throws at a Runtime Argument written in
// another file than the Schema's `pvl.compile(...)` call (ADR-0043).
import type { PvlSchemaMethodName } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { BaseException } from './baseException.js';

/**
 * Thrown at a method's argument that is a Runtime Argument of an Imported
 * Schema, reported as RUNTIME_ARGUMENT_IN_IMPORTED_SCHEMA: it is evaluated
 * in the file it is written in, so it can't be inlined into another one.
 */
export class RuntimeArgumentInImportedSchemaException extends BaseException {
  /**
   * The exception at `argument`, passed to the method `methodName`.
   *
   * ```ts
   * // shared/user.ts: export const user = pvl.string().max(LIMIT);
   * new RuntimeArgumentInImportedSchemaException(<LIMIT>, 'max').message
   * // "`LIMIT`, passed to `.max()`, is a Runtime Argument of a Schema imported from that file. …"
   * ```
   */
  public constructor(argument: Node, methodName: PvlSchemaMethodName) {
    super(
      `\`${argument.getText()}\`, passed to \`.${methodName}()\`, is a Runtime Argument of a Schema imported from that file. A Runtime Argument is evaluated in the file it is written in, so it can't be inlined into this one. Move the Schema into this file, or compile it in its own file and nest it here in a Schema that isn't compiled.`,
      { errorCode: DIAGNOSTIC_CODE.RUNTIME_ARGUMENT_IN_IMPORTED_SCHEMA, offendingNode: argument },
    );
  }
}
