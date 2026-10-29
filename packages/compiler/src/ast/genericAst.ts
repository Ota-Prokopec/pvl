// Reading TypeScript syntax statically, with no PVL knowledge: matching a node
// against a shape, seeing through parentheses, `as` and top-level `const`s,
// of the same file or imported, reading literals as values, whether a file
// parses and exports anything, which of its statements export a default or
// run code, and where its module specifiers are written. Nothing is imported
// or executed.
import {
  Node,
  SyntaxKind,
  ts,
  VariableDeclarationKind,
  type CallExpression,
  type ExportAssignment,
  type Identifier,
  type PrefixUnaryExpression,
  type PropertyAccessExpression,
  type SourceFile,
  type Statement,
  type StringLiteral,
  type VariableDeclaration,
} from 'ts-morph';
import { ConstCycleException, UnresolvedNodeException } from '../exceptions/index.js';
import type { NamespaceImportRead, ParseError } from './types.js';

/** An argument written as a literal in source: `3`, `'a'`, `10n`, `{ message: 'too short' }`. */
export type StaticValue =
  | string
  | number
  | boolean
  | bigint
  | ReadonlyArray<StaticValue>
  | { readonly [key: string]: StaticValue };

/** The declarations of the `const`s followed to reach a node, so one that reaches itself is caught. */
export type FollowedConsts = ReadonlySet<VariableDeclaration>;

/** A node with `const`s seen through, and every `const` followed on the way to it. */
type FollowedNode = {
  node: Node;
  followed: FollowedConsts;
};

/** A call whose callee is a property read, `<receiver>.<methodName>(…)`. */
export type PropertyAccessCallExpression = {
  getExpression(): PropertyAccessExpression;
} & CallExpression;

/** A call of a property, `<receiver>.<methodName>(…)`, split into its parts. */
export type PropertyAccessCall = {
  call: PropertyAccessCallExpression;
  /** What the property is read off: `pvl` in `pvl.string()`. */
  receiver: Node;
  /** The property called: `string` in `pvl.string()`. */
  methodName: string;
};

/**
 * Static helpers for matching and reading ts-morph nodes. `is…`/`as…`
 * methods answer whether a node has a shape and never throw; `read…`/`follow…`
 * methods return a value and throw UnresolvedNodeException or
 * ConstCycleException when they can't.
 *
 * A `followed` parameter carries the `const`s already being read; callers
 * leave it out, and each method passes it on when it recurses.
 */
export class GenericAst {
  /**
   * The expression `node` wraps in parentheses or an `as` assertion, at any
   * depth; `node` itself when it is neither. Only these two are seen through:
   * `satisfies` and the non-null `!` would change what compiles
   * ([compilation.md](../../../../docs/specification/compiler/compilation.md#what-reads-statically)).
   *
   * ```ts
   * GenericAst.unwrap(<(user)>)              // <user>
   * GenericAst.unwrap(<((user as Schema))>)  // <user>
   * GenericAst.unwrap(<['A'] as const>)      // <['A']>
   * GenericAst.unwrap(<user>)                // <user>: nothing to see through
   * GenericAst.unwrap(<user!>)               // <user!>: a non-null assertion is kept
   * GenericAst.unwrap(<user satisfies Schema>) // <user satisfies Schema>: kept
   * ```
   */
  public static unwrap(node: Node): Node {
    return Node.isParenthesizedExpression(node) || Node.isAsExpression(node)
      ? GenericAst.unwrap(node.getExpression())
      : node;
  }

  /**
   * Whether `node` spreads a value as written: a spread element, or an
   * object literal with a spread property, seen through parentheses and
   * `as` (`unwrap`). A `const` is not followed, as what it holds is spread
   * where it is declared.
   *
   * ```ts
   * GenericAst.isSpread(<...limits>)                    // true
   * GenericAst.isSpread(<{ ...options, message: 'x' }>) // true
   * GenericAst.isSpread(<options>)                      // false, whatever `options` holds
   * GenericAst.isSpread(<{ message: 'x' }>)             // false
   * ```
   */
  public static isSpread(node: Node): boolean {
    const unwrappedNode = GenericAst.unwrap(node);
    return (
      Node.isSpreadElement(unwrappedNode) ||
      (Node.isObjectLiteralExpression(unwrappedNode) &&
        unwrappedNode.getProperties().some((property) => Node.isSpreadAssignment(property)))
    );
  }

  /**
   * Whether any of `sourceFile`'s top-level statements exports a name, in
   * any form:
   *
   * ```ts
   * export const user = …;        export { user };
   * export * from './user.js';    export type User = …;
   * ```
   *
   * A file of only `const internal = 1;` exports nothing.
   */
  public static hasExport(sourceFile: SourceFile): boolean {
    return sourceFile
      .getStatements()
      .some(
        (statement) =>
          Node.isExportDeclaration(statement) ||
          Node.isExportAssignment(statement) ||
          (Node.isExportable(statement) && statement.hasExportKeyword()),
      );
  }

  /**
   * Whether a top-level statement exports a default, in any of its forms:
   *
   * ```ts
   * export default user;                    // true
   * export = user;                          // true
   * export default class Registry {}        // true
   * export { user as default };             // true
   * export { default } from './legacy.js';  // true
   * export { default as legacy } from './legacy.js'; // false: named `legacy`
   * export * from './user.js';              // false: `export *` skips defaults
   * ```
   */
  public static isDefaultExport(statement: Statement): boolean {
    if (Node.isExportAssignment(statement)) {
      return true;
    }
    if (Node.isExportDeclaration(statement)) {
      return statement.getNamedExports().some((exportSpecifier) => {
        const exportedName = exportSpecifier.getAliasNode()?.getText() ?? exportSpecifier.getName();
        return exportedName === 'default';
      });
    }
    return Node.isExportable(statement) && statement.isDefaultExport();
  }

  /**
   * The first error TypeScript's parser reports in `sourceFile`, or
   * `undefined` when it parses. The later ones are usually its knock-on
   * effects. A grammar error TypeScript's checker reports, such as a
   * top-level `return`, isn't one, and neither is a type error
   * ([ADR-0042](../../../../docs/adr/0042-the-precheck-leaves-grammar-errors-to-the-applications-toolchain.md)).
   *
   * ```ts
   * GenericAst.findFirstParseError(<export const user = pvl.object({ name: pvl.string() ;>)
   * // { message: "',' expected.", line: 1 }
   * GenericAst.findFirstParseError(<return;>)                   // undefined: a checker error
   * GenericAst.findFirstParseError(<const age: number = 'x';>) // undefined: a type error
   * ```
   */
  public static findFirstParseError(sourceFile: SourceFile): ParseError | undefined {
    const [syntaxDiagnostic] = sourceFile
      .getProject()
      .getProgram()
      .getSyntacticDiagnostics(sourceFile);
    return syntaxDiagnostic === undefined
      ? undefined
      : {
          message: ts.flattenDiagnosticMessageText(
            syntaxDiagnostic.compilerObject.messageText,
            ' ',
          ),
          line: syntaxDiagnostic.getLineNumber(),
        };
  }

  /**
   * Whether a top-level statement runs code when its module is evaluated,
   * rather than only declaring a name. A declaration's initializer doesn't
   * count, since building a Schema is exactly that, and neither does a
   * directive such as `'use strict';`, which evaluates nothing.
   *
   * ```ts
   * GenericAst.isSideEffectStatement(<console.log('loaded');>)                 // true
   * GenericAst.isSideEffectStatement(<if (debug) { … }>)                       // true
   * GenericAst.isSideEffectStatement(<export const user = pvl.object({ … });>) // false: a declaration
   * GenericAst.isSideEffectStatement(<import { pvl } from '@pcvl/schema';>)     // false: an import
   * GenericAst.isSideEffectStatement(<export { user as account };>)            // false: an export
   * GenericAst.isSideEffectStatement(<'use strict';>)                          // false: a directive
   * ```
   */
  public static isSideEffectStatement(statement: Statement): boolean {
    return !(
      Node.isVariableStatement(statement) ||
      Node.isFunctionDeclaration(statement) ||
      Node.isClassDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isEnumDeclaration(statement) ||
      Node.isModuleDeclaration(statement) ||
      Node.isImportEqualsDeclaration(statement) ||
      Node.isImportDeclaration(statement) ||
      Node.isExportDeclaration(statement) ||
      Node.isExportAssignment(statement) ||
      Node.isEmptyStatement(statement) ||
      (Node.isExpressionStatement(statement) && Node.isStringLiteral(statement.getExpression()))
    );
  }

  /**
   * Whether `node` is a method call, `<receiver>.<methodName>(…)`: a call
   * whose callee is a property read. The receiver is any expression.
   *
   * ```ts
   * GenericAst.isPropertyAccessCall(<pvl.string()>)        // true
   * GenericAst.isPropertyAccessCall(<pvl.string().min(3)>) // true
   * GenericAst.isPropertyAccessCall(<pvl.string>)          // false: read, not called
   * GenericAst.isPropertyAccessCall(<makeUser()>)          // false: a plain function call
   * GenericAst.isPropertyAccessCall(<schemas['user']()>)   // false: an element access
   * GenericAst.isPropertyAccessCall(<(pvl.string)()>)      // false: the callee is parenthesized
   * ```
   */
  public static isPropertyAccessCall(node: Node): node is PropertyAccessCallExpression {
    return Node.isCallExpression(node) && Node.isPropertyAccessExpression(node.getExpression());
  }

  /**
   * `node` split into the call, its receiver and its method name when it is a
   * method call (`isPropertyAccessCall`); `undefined` for any other shape.
   * The receiver is returned as written, `const`s not followed.
   *
   * ```ts
   * GenericAst.asPropertyAccessCall(<pvl.string()>)        // { call: <pvl.string()>, receiver: <pvl>, methodName: 'string' }
   * GenericAst.asPropertyAccessCall(<pvl.string().min(3)>) // { call: <….min(3)>, receiver: <pvl.string()>, methodName: 'min' }
   * GenericAst.asPropertyAccessCall(<pvl.string>)          // undefined: read, not called
   * ```
   */
  public static asPropertyAccessCall(node: Node): PropertyAccessCall | undefined {
    if (!GenericAst.isPropertyAccessCall(node)) {
      return undefined;
    }
    const callee = node.getExpression();
    return { call: node, receiver: callee.getExpression(), methodName: callee.getName() };
  }

  /**
   * The expression `node` stands for, with every `const` it names replaced by
   * that `const`'s initializer, through any number of `const`s, plus the
   * `const`s followed to get there. Parentheses and `as` are seen through
   * (`unwrap`). An identifier is followed only when it names a top-level
   * `const` in its scope, of `node`'s own file or imported from another
   * (`findTopLevelConst`): any other identifier, one shadowing such a
   * `const` included, throws UnresolvedNodeException, and a `const` that is
   * reached again while it is being followed, or while its value is being
   * read (`followed`), throws ConstCycleException, in whichever file.
   *
   * ```ts
   * // const MIN = 3; const LIMIT = (MIN);
   * GenericAst.followConst(<LIMIT>)            // { node: <3>, followed: {<LIMIT = (MIN)>, <MIN = 3>} }
   * GenericAst.followConst(<'a'>)              // { node: <'a'>, followed: {} }: no const to follow
   * GenericAst.followConst(<pvl.string()>)     // { node: <pvl.string()>, followed: {} }: only identifiers are followed
   * // import { user } from './user.js', where `export const user = pvl.string();`
   * GenericAst.followConst(<user>)             // { node: <pvl.string()>, followed: {<user = pvl.string()>} }
   * // import user from './user.js', where `export default pvl.string();`; let limit = 3;
   * GenericAst.followConst(<user>)             // throws UnresolvedNodeException(<user>): a default-exported expression is no `const`
   * GenericAst.followConst(<limit>)            // throws UnresolvedNodeException(<limit>): a `let`
   * // const MIN = 3; (MIN: number) => MIN;
   * GenericAst.followConst(<MIN>)              // throws UnresolvedNodeException(<MIN>): `MIN` is the parameter
   * // const a = b; const b = a;
   * GenericAst.followConst(<a>)                // throws ConstCycleException(<a>), at the second `a`
   * // const user = pvl.object({ friend: user });
   * GenericAst.followConst(<user>, {<user = …>}) // throws ConstCycleException(<user>): `user` is already being read
   * ```
   */
  public static followConst(node: Node, followed: FollowedConsts = new Set()): FollowedNode {
    const unwrappedNode = GenericAst.unwrap(node);
    if (!Node.isIdentifier(unwrappedNode)) {
      return { node: unwrappedNode, followed };
    }

    const declaration = GenericAst.findTopLevelConst(unwrappedNode);
    const initializer = declaration?.getInitializer();
    if (declaration === undefined || initializer === undefined) {
      throw new UnresolvedNodeException(unwrappedNode);
    }

    if (followed.has(declaration)) {
      throw new ConstCycleException(unwrappedNode);
    }

    return GenericAst.followConst(initializer, new Set([...followed, declaration]));
  }

  /**
   * The declaration `identifier` names when it is a top-level `const`, of
   * `identifier`'s own file or imported from another (`findBoundDeclaration`);
   * `undefined` for any other binding, a parameter or a local that shadows
   * the `const` included. Names are bound only, and no type is checked
   * ([ADR-0024](../../../../docs/adr/0024-the-compiler-checks-syntax-not-types.md)).
   *
   * ```ts
   * // const MIN = 3;
   * GenericAst.findTopLevelConst(<MIN>)                          // <MIN = 3>
   * GenericAst.findTopLevelConst(<age>), in `({ age })`           // <age = …>, with `const age = …`
   * GenericAst.findTopLevelConst(<MIN>), in `(MIN: number) => MIN` // undefined: the parameter
   * GenericAst.findTopLevelConst(<MIN>), in `{ const MIN = 5; MIN }` // undefined: a block-scoped `const`
   * // import { user } from './user.js', where `export const user = …`; let limit = 3;
   * GenericAst.findTopLevelConst(<user>)                         // <user = …>, in user.ts
   * GenericAst.findTopLevelConst(<limit>)                        // undefined: a `let`
   * ```
   */
  private static findTopLevelConst(identifier: Identifier): VariableDeclaration | undefined {
    const declaration = GenericAst.findBoundDeclaration(identifier);
    return Node.isVariableDeclaration(declaration) && GenericAst.isTopLevelConst(declaration)
      ? declaration
      : undefined;
  }

  /**
   * The declaration `identifier` is bound to in its scope, through any
   * import, re-export (`export { user } from`, `export * from`) or default
   * export to the one it names in its own file. In a shorthand property,
   * `{ age }`, the name is bound as the value it reads.
   *
   * ```ts
   * // const MIN = 3;
   * GenericAst.findBoundDeclaration(<MIN>)  // <MIN = 3>
   * // import { user as u } from './schemas.js', a barrel holding `export * from './user.js'`
   * GenericAst.findBoundDeclaration(<u>)    // <user = …>, in user.ts
   * // import user from './user.js', where `export default pvl.string();`
   * GenericAst.findBoundDeclaration(<user>) // <export default pvl.string();>
   * ```
   */
  private static findBoundDeclaration(identifier: Identifier): Node | undefined {
    const identifierParent = identifier.getParent();
    const symbol = Node.isShorthandPropertyAssignment(identifierParent)
      ? identifierParent.getValueSymbol()
      : identifier.getSymbol();
    return (symbol?.isAlias() === true ? symbol.getAliasedSymbol() : symbol)?.getValueDeclaration();
  }

  /**
   * The declaration the name `node` reads in its own file: an import's
   * specifier or namespace rather than what it imports, which
   * `findBoundDeclaration` follows to; `undefined` for a name nothing
   * declares. A parameter or a local that shadows an import is its own
   * declaration.
   *
   * ```ts
   * // import { pvl as p } from '@pcvl/schema';
   * GenericAst.findLocalDeclaration(<p>)       // <pvl as p>
   * // import * as schemas from './schemas.js';
   * GenericAst.findLocalDeclaration(<schemas>) // <* as schemas>
   * // (pvl: Factory) => pvl.string()
   * GenericAst.findLocalDeclaration(<pvl>)     // <pvl: Factory>
   * ```
   */
  public static findLocalDeclaration(node: Node): Node | undefined {
    return node.getSymbol()?.getDeclarations()[0];
  }

  /**
   * The `export default <expression>` that `node` is bound to, when it is a
   * name imported from a default export that names no declaration of its
   * own; `undefined` for anything else.
   *
   * ```ts
   * // import user from './user.js', where `export default pvl.string();`
   * GenericAst.findBoundDefaultExport(<user>) // <export default pvl.string();>
   * // import tag from './tag.js', where `const tag = …; export default tag;`
   * GenericAst.findBoundDefaultExport(<tag>)  // undefined: bound to <tag = …>
   * ```
   */
  public static findBoundDefaultExport(node: Node): ExportAssignment | undefined {
    if (!Node.isIdentifier(node)) {
      return undefined;
    }
    const declaration = GenericAst.findBoundDeclaration(node);
    return Node.isExportAssignment(declaration) ? declaration : undefined;
  }

  /**
   * `node` as a property read off a namespace import, with the import's
   * Module Specifier; `undefined` for any other node.
   *
   * ```ts
   * // import * as schemas from './schemas.js';
   * GenericAst.asNamespaceImportRead(<schemas.user>) // { moduleSpecifierAsString: './schemas.js', propertyName: 'user' }
   * GenericAst.asNamespaceImportRead(<user.shape>)   // undefined: `user` is no namespace import
   * ```
   */
  public static asNamespaceImportRead(node: Node): NamespaceImportRead | undefined {
    if (!Node.isPropertyAccessExpression(node)) {
      return undefined;
    }
    const namespaceImport = GenericAst.findLocalDeclaration(node.getExpression());
    if (!Node.isNamespaceImport(namespaceImport)) {
      return undefined;
    }
    return {
      moduleSpecifierAsString: namespaceImport
        .getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
        .getModuleSpecifierValue(),
      propertyName: node.getName(),
    };
  }

  /**
   * The top-level `const` declarator of `node`'s file that `node` is written
   * in, at any depth; `undefined` when it is in none.
   *
   * ```ts
   * // const base = pvl.string().max(getMax());
   * GenericAst.findEnclosingTopLevelConst(<getMax()>) // <base = pvl.string().max(getMax())>
   * // let limit = getMax();
   * GenericAst.findEnclosingTopLevelConst(<getMax()>) // undefined: a `let`
   * // const getUser = () => { const limit = getMax(); … };
   * GenericAst.findEnclosingTopLevelConst(<getMax()>) // <getUser = …>: `limit` is block-scoped
   * ```
   */
  public static findEnclosingTopLevelConst(node: Node): VariableDeclaration | undefined {
    return node.getFirstAncestor(
      (ancestor): ancestor is VariableDeclaration =>
        Node.isVariableDeclaration(ancestor) && GenericAst.isTopLevelConst(ancestor),
    );
  }

  /** Whether `declaration` is a `const` declared at the top level of its file. */
  private static isTopLevelConst(declaration: VariableDeclaration): boolean {
    const variableStatement = declaration.getVariableStatement();
    return (
      variableStatement?.getDeclarationKind() === VariableDeclarationKind.Const &&
      variableStatement.getParent() === declaration.getSourceFile()
    );
  }

  /** Whether `node` lies within `container`'s text, `container` itself included. */
  public static isWithin(node: Node, container: Node): boolean {
    return container.getStart() <= node.getStart() && node.getEnd() <= container.getEnd();
  }

  /**
   * Every string literal in `sourceFile` that names a module, in any form a
   * module can be named in, each as written.
   *
   * ```ts
   * import { user } from './user.js';                 // './user.js'
   * import './setup.js';                              // './setup.js'
   * export { trim } from '../lib/helpers.js';         // '../lib/helpers.js'
   * const heavy = () => import('./heavy.js');         // './heavy.js'
   * import fs = require('../lib/fs.js');              // '../lib/fs.js'
   * type Options = import('../lib/types.js').Options; // '../lib/types.js'
   * import(`./locales/${lang}.js`);                   // left out: computed, not a literal
   * export { user };                                  // left out: names no module
   * ```
   */
  public static findModuleSpecifierLiterals(sourceFile: SourceFile): StringLiteral[] {
    const declarationModuleSpecifiers = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ].flatMap((declaration) => declaration.getModuleSpecifier() ?? []);

    const dynamicImportModuleSpecifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
      .flatMap((call) => call.getArguments().slice(0, 1))
      .filter((argument) => Node.isStringLiteral(argument));

    const requireModuleSpecifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.ExternalModuleReference)
      .map((moduleReference) => moduleReference.getExpression())
      .filter((expression) => Node.isStringLiteral(expression));

    const importTypeModuleSpecifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.ImportType)
      .map((importType) => importType.getArgument())
      .flatMap((argument) => (Node.isLiteralTypeNode(argument) ? [argument.getLiteral()] : []))
      .filter((literal) => Node.isStringLiteral(literal));

    return [
      ...declarationModuleSpecifiers,
      ...dynamicImportModuleSpecifiers,
      ...requireModuleSpecifiers,
      ...importTypeModuleSpecifiers,
    ];
  }

  /**
   * The value `node` evaluates to, read from source without running it,
   * following `const`s: a string, number, bigint or boolean literal, a
   * template literal with no `${…}`, `-`, `+` or `!` applied to one any number
   * of times (`readPrefixUnary`), or an array or object literal built of
   * them. Anything else throws UnresolvedNodeException at the node that can't
   * be read: a call, an import, a `let`, a spread, a template with `${…}`, a
   * binary expression, and `++`/`--`, which assign and so never read
   * ([ADR-0025](../../../../docs/adr/0025-static-reading-never-evaluates-an-assignment.md)).
   * A `const` that reaches itself throws ConstCycleException.
   *
   * ```ts
   * GenericAst.readStaticValue(<'a'>)                  // 'a'
   * GenericAst.readStaticValue(<`a`>)                  // 'a'
   * GenericAst.readStaticValue(<10n>)                  // 10n
   * GenericAst.readStaticValue(<-1>)                   // -1
   * GenericAst.readStaticValue(<!!0>)                  // false
   * GenericAst.readStaticValue(<+'2'>)                 // 2
   * GenericAst.readStaticValue(<{ message: 'x' }>)     // { message: 'x' }
   * GenericAst.readStaticValue(<['A', MIN]>)           // ['A', 3], with `const MIN = 3`
   * GenericAst.readStaticValue(<Math.max(1, 2)>)       // throws UnresolvedNodeException(<Math.max(1, 2)>)
   * GenericAst.readStaticValue(<`${prefix}a`>)         // throws UnresolvedNodeException: a template with `${…}`
   * GenericAst.readStaticValue(<++count>)              // throws UnresolvedNodeException(<++count>)
   * // const options = { message: options };
   * GenericAst.readStaticValue(<options>)              // throws ConstCycleException(<options>), the inner one
   * ```
   */
  public static readStaticValue(node: Node, followed: FollowedConsts = new Set()): StaticValue {
    const { node: value, followed: reading } = GenericAst.followConst(node, followed);

    if (
      Node.isStringLiteral(value) ||
      Node.isNoSubstitutionTemplateLiteral(value) ||
      Node.isNumericLiteral(value) ||
      Node.isTrueLiteral(value) ||
      Node.isFalseLiteral(value)
    ) {
      return value.getLiteralValue();
    }

    if (Node.isBigIntLiteral(value)) {
      return value.getLiteralValue() as bigint;
    }

    if (Node.isPrefixUnaryExpression(value)) {
      return GenericAst.readPrefixUnary(value, reading);
    }

    if (Node.isArrayLiteralExpression(value)) {
      return GenericAst.readArray(value, GenericAst.readStaticValue, reading);
    }

    if (Node.isObjectLiteralExpression(value)) {
      // Spread back onto a plain object, which keeps an own `__proto__` key.
      return {
        ...GenericAst.readObject(value, GenericAst.readStaticValue, reading),
      };
    }
    throw new UnresolvedNodeException(value);
  }

  /**
   * The value `node` evaluates to when it is a literal written in place, read
   * as `readStaticValue` reads one but following no `const`: a name of a
   * top-level `const` anywhere in it throws UnresolvedNodeException at that
   * name, as does any other name `readStaticValue` meets. A property's own name and
   * a type are no names it reads.
   *
   * ```ts
   * GenericAst.readLiteral(<-1>)                // -1
   * GenericAst.readLiteral(<{ message: 'x' }>)  // { message: 'x' }
   * GenericAst.readLiteral(<['a'] as const>)    // ['a']
   * // const MAX = 3; const MESSAGE = 'x';
   * GenericAst.readLiteral(<3 as typeof MAX>)   // 3: `MAX` is in a type
   * GenericAst.readLiteral(<MAX>)               // throws UnresolvedNodeException(<MAX>)
   * GenericAst.readLiteral(<-MAX>)              // throws UnresolvedNodeException(<MAX>)
   * GenericAst.readLiteral(<{ message: MESSAGE }>) // throws UnresolvedNodeException(<MESSAGE>)
   * ```
   */
  public static readLiteral(node: Node): StaticValue {
    const constName = [node, ...node.getDescendantsOfKind(SyntaxKind.Identifier)].find(
      (descendant) =>
        Node.isIdentifier(descendant) &&
        descendant.getFirstAncestor(Node.isTypeNode) === undefined &&
        GenericAst.findTopLevelConst(descendant) !== undefined,
    );
    if (constName !== undefined) {
      throw new UnresolvedNodeException(constName);
    }
    return GenericAst.readStaticValue(node);
  }

  /**
   * The value of `-x`, `+x` or `!x`, its operand read with `readStaticValue`,
   * so the operators stack to any depth (`!!!x`, `-+x`). Each one gives what
   * JavaScript gives, where it gives one without throwing:
   *
   * - `!` negates any static value: an array or object literal is truthy.
   * - `-` negates a number or a bigint.
   * - `+` turns a number, a string or a boolean into a number (`NaN` for a
   *   string that isn't one). A bigint throws at runtime, so it is unresolvable.
   *
   * `++` and `--` assign to their operand, so they never read and throw
   * without reading it
   * ([ADR-0025](../../../../docs/adr/0025-static-reading-never-evaluates-an-assignment.md)).
   * So does `~`, which isn't read yet.
   *
   * ```ts
   * GenericAst.readPrefixUnary(<!0>)      // true
   * GenericAst.readPrefixUnary(<!!!'a'>)  // false
   * GenericAst.readPrefixUnary(<![]>)     // false: an array is truthy
   * GenericAst.readPrefixUnary(<-10n>)    // -10n
   * GenericAst.readPrefixUnary(<-+1>)     // -1
   * GenericAst.readPrefixUnary(<+'2'>)    // 2
   * GenericAst.readPrefixUnary(<+true>)   // 1
   * GenericAst.readPrefixUnary(<+'abc'>)  // NaN
   * GenericAst.readPrefixUnary(<-'2'>)    // throws UnresolvedNodeException(<-'2'>): `-` reads only numbers and bigints
   * GenericAst.readPrefixUnary(<+10n>)    // throws UnresolvedNodeException(<+10n>): a TypeError at runtime
   * GenericAst.readPrefixUnary(<++count>) // throws UnresolvedNodeException(<++count>): an assignment
   * GenericAst.readPrefixUnary(<~1>)      // throws UnresolvedNodeException(<~1>)
   * ```
   */
  private static readPrefixUnary(
    expression: PrefixUnaryExpression,
    followed: FollowedConsts,
  ): StaticValue {
    const operator = expression.getOperatorToken();
    if (
      operator !== SyntaxKind.ExclamationToken &&
      operator !== SyntaxKind.MinusToken &&
      operator !== SyntaxKind.PlusToken
    ) {
      throw new UnresolvedNodeException(expression);
    }

    const operand = GenericAst.readStaticValue(expression.getOperand(), followed);
    if (operator === SyntaxKind.ExclamationToken) {
      return !operand;
    }
    if (
      operator === SyntaxKind.MinusToken &&
      (typeof operand === 'number' || typeof operand === 'bigint')
    ) {
      return -operand;
    }
    if (
      operator === SyntaxKind.PlusToken &&
      (typeof operand === 'number' || typeof operand === 'string' || typeof operand === 'boolean')
    ) {
      return Number(operand);
    }
    throw new UnresolvedNodeException(expression);
  }

  /**
   * The elements of the array literal `node` holds, following `const`s, each
   * read by `readElement` with the `const`s followed so far, in order. Any
   * other node throws UnresolvedNodeException; a spread is passed to
   * `readElement` like any element, which rejects it.
   *
   * ```ts
   * GenericAst.readArray(<[pvl.string(), user]>, readNested)  // [<StringSchema>, <what `const user` holds>]
   * GenericAst.readArray(<MEMBERS>, readStaticValue)          // ['A', 'B'], with `const MEMBERS = ['A', 'B']`
   * GenericAst.readArray(<[]>, readStaticValue)               // []
   * GenericAst.readArray(<[...base]>, readStaticValue)        // throws UnresolvedNodeException(<...base>), from readStaticValue
   * GenericAst.readArray(<'a'>, readStaticValue)              // throws UnresolvedNodeException(<'a'>): not an array
   * ```
   */
  public static readArray<Element>(
    node: Node,
    readElement: (element: Node, followed: FollowedConsts) => Element,
    followed: FollowedConsts = new Set(),
  ): Element[] {
    const { node: array, followed: reading } = GenericAst.followConst(node, followed);
    if (!Node.isArrayLiteralExpression(array)) {
      throw new UnresolvedNodeException(array);
    }
    return array.getElements().map((element) => readElement(element, reading));
  }

  /**
   * The own properties of the object literal `node` holds, following
   * `const`s, as a prototype-less record of each key (`readPropertyKey`) to
   * its value read by `readValue`. The keys come in the order JavaScript
   * gives them: integer-like keys first, ascending, then the rest as written.
   * A key written twice keeps its first place and its last value. A plain
   * `__proto__: …` sets the prototype rather than adding a key, so it is
   * left out; a computed `['__proto__']: …` is a key. A shorthand `{ age }`
   * reads `age` as an expression. Any other node, a spread, a method or an
   * accessor throws UnresolvedNodeException.
   *
   * ```ts
   * GenericAst.readObject(<{ name: 'a', 'e-mail': 'b' }>, readStaticValue) // { name: 'a', 'e-mail': 'b' }
   * GenericAst.readObject(<{ age }>, readStaticValue)                      // { age: 3 }, with `const age = 3`
   * GenericAst.readObject(<{ b: 1, 1: 2 }>, readStaticValue)               // { 1: 2, b: 1 }: '1' first
   * GenericAst.readObject(<{ a: 1, a: 2 }>, readStaticValue)               // { a: 2 }
   * GenericAst.readObject(<{ __proto__: 1 }>, readStaticValue)             // {}: it sets the prototype
   * GenericAst.readObject(<{ ['__proto__']: 1 }>, readStaticValue)         // { __proto__: 1 }, an own key
   * GenericAst.readObject(<{ ...base }>, readStaticValue)                  // throws UnresolvedNodeException(<...base>)
   * GenericAst.readObject(<{ get a() { return 1; } }>, readStaticValue)    // throws UnresolvedNodeException(<get a() …>)
   * GenericAst.readObject(<['a']>, readStaticValue)                        // throws UnresolvedNodeException(<['a']>): not an object
   * ```
   */
  public static readObject<Value>(
    node: Node,
    readValue: (value: Node, followed: FollowedConsts) => Value,
    followed: FollowedConsts = new Set(),
  ): Record<string, Value> {
    const { node: object, followed: reading } = GenericAst.followConst(node, followed);

    if (!Node.isObjectLiteralExpression(object)) {
      throw new UnresolvedNodeException(object);
    }

    // No prototype, so every key, `__proto__` included, is an own key.
    const valueByKey = Object.create(null) as Record<string, Value>;

    for (const property of object.getProperties()) {
      // Case: const name = "value"; const variable = { name }
      if (Node.isShorthandPropertyAssignment(property)) {
        valueByKey[property.getName()] = readValue(property.getNameNode(), reading);
        continue;
      }

      // `name: pvl.string()` is a property assignment, and `pvl.string()` its initializer.
      const initializer = Node.isPropertyAssignment(property)
        ? property.getInitializer()
        : undefined;

      if (!Node.isPropertyAssignment(property) || initializer === undefined) {
        throw new UnresolvedNodeException(property);
      }

      const nameNode = property.getNameNode();
      const key = GenericAst.readPropertyKey(nameNode, reading);
      //TODO: Make a special function for copying object - the function will also handle `__proto__` key properly
      if (key === '__proto__' && !Node.isComputedPropertyName(nameNode)) {
        // Node.isComputedPropertyName(nameNode) true if {[key]: "value"} - key is computed
        continue;
      }
      valueByKey[key] = readValue(initializer, reading);
    }

    return valueByKey;
  }

  /**
   * The runtime key, as a string, of an object literal's property name
   * `nameNode`. A plain name is its own text, never followed as a `const`; a
   * string or numeric literal is its value; a computed name, `[expression]`,
   * is read with `readStaticValue` and must be a string or a number, as
   * TypeScript requires, else it throws UnresolvedNodeException
   * ([ADR-0024](../../../../docs/adr/0024-the-compiler-checks-syntax-not-types.md)).
   *
   * ```ts
   * GenericAst.readPropertyKey(<name>)       // 'name'
   * GenericAst.readPropertyKey(<'e-mail'>)   // 'e-mail'
   * GenericAst.readPropertyKey(<1>)          // '1'
   * GenericAst.readPropertyKey(<0x10>)       // '16'
   * GenericAst.readPropertyKey(<['e-mail']>) // 'e-mail'
   * GenericAst.readPropertyKey(<[KEY]>)      // 'id', with `const KEY = 'id'`
   * GenericAst.readPropertyKey(<[-1]>)       // '-1'
   * GenericAst.readPropertyKey(<[true]>)     // throws UnresolvedNodeException(<[true]>): not a string or a number
   * GenericAst.readPropertyKey(<[key]>)      // throws UnresolvedNodeException(<key>), with `let key`
   * ```
   */
  private static readPropertyKey(nameNode: Node, followed: FollowedConsts = new Set()): string {
    if (Node.isIdentifier(nameNode)) {
      return nameNode.getText();
    }
    if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) {
      return String(nameNode.getLiteralValue());
    }
    if (Node.isComputedPropertyName(nameNode)) {
      const key = GenericAst.readStaticValue(nameNode.getExpression(), followed);
      if (typeof key === 'string' || typeof key === 'number') {
        return String(key);
      }
    }
    throw new UnresolvedNodeException(nameNode);
  }
}
