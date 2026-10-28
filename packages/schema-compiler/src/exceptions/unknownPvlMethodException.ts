// The exception PvlAst throws at a call of a method `@pvl/schema` doesn't
// have, on `pvl` or chained onto a Schema (ADR-0038).
import type { PropertyAccessCallExpression } from '../ast/genericAst.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { BaseException } from './baseException.js';

/**
 * Thrown by `PvlAst.readCallChain` at a call whose method `@pvl/schema`
 * doesn't have, called on `pvl` (`pvl.foo()`) or chained onto a Schema
 * (`pvl.string().foo()`), reported as UNSUPPORTED_SCHEMA. Reading stops at
 * it, so a Schema reports only the first one.
 */
export class UnknownPvlMethodException extends BaseException {
  /**
   * The exception at `unknownCall`, naming its method.
   *
   * ```ts
   * new UnknownPvlMethodException(<pvl.string().foo()>).message // "`.foo()` isn't a method `@pvl/schema` has."
   * new UnknownPvlMethodException(<pvl.foo()>).message          // "`.foo()` isn't a method `@pvl/schema` has."
   * ```
   */
  public constructor(unknownCall: PropertyAccessCallExpression) {
    super(`\`.${unknownCall.getExpression().getName()}()\` isn't a method \`@pvl/schema\` has.`, {
      errorCode: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
      offendingNode: unknownCall,
    });
  }
}
