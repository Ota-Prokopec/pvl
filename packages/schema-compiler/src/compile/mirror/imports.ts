// The Destination File's import block: every import from outside the set,
// hoisted and merged into one declaration per module specifier and binding
// kind, sorted so the same input always prints the same block.
import type { ImportBinding } from './moduleContextReader.js';

// Orders two import bindings alphabetically by their local name, for
// `Array.prototype.sort`, so the names in an import's braces never move
// between runs: `{ object, pvl, string }`.
const compareByLocalName = (first: ImportBinding, second: ImportBinding): number => {
  return first.localName < second.localName ? -1 : 1;
};

// One name in a named import's braces. A type-only name is marked `type`
// unless the whole declaration is `import type`, which already says so.
//
//   { importedName: 'user', localName: 'user' }       // 'user'
//   { importedName: 'user', localName: 'account' }    // 'user as account'
//   { …, isTypeOnly: true }, in `import { … }`        // 'type User'
//   { …, isTypeOnly: true }, in `import type { … }`   // 'User'
const formatNamedImportSpecifier = (
  { importedName, localName, isTypeOnly }: ImportBinding,
  isWholeImportTypeOnly: boolean,
): string => {
  const importSpecifierText =
    importedName === localName ? localName : `${importedName} as ${localName}`;
  return isTypeOnly && !isWholeImportTypeOnly ? `type ${importSpecifierText}` : importSpecifierText;
};

export type RenderImportBlockArgs = {
  externalImports: ReadonlyArray<ImportBinding>;
  /** Module specifiers imported for their side effect only. */
  sideEffectModuleSpecifiers: ReadonlyArray<string>;
};

/**
 * The import block at the top of the Destination File: every import from
 * outside the scanned set, merged into one declaration per module specifier,
 * the declarations sorted by module specifier. The same name imported by
 * several modules is imported once, and as `type` only if every module
 * imported it as a type.
 *
 * ```ts
 * // user.ts: import { pvl } from '@pvl/schema';  import '../setup.js';
 * // post.ts: import { pvl, type Infer } from '@pvl/schema';
 * //          import config from '../config.js';
 *
 * import config from '../config.js';
 * import '../setup.js';
 * import { type Infer, pvl } from '@pvl/schema';
 * ```
 *
 * Imports into the scanned set never reach here: they collapse into direct
 * references.
 */
export const renderImportBlock = ({
  externalImports,
  sideEffectModuleSpecifiers,
}: RenderImportBlockArgs): string => {
  // The same binding imported by several modules is one import, type-only
  // only when every module imported it as a type.
  const mergedBindingByKey = new Map<string, ImportBinding>();
  for (const importBinding of externalImports) {
    const bindingKey = `${importBinding.rewrittenModuleSpecifier}\0${importBinding.importedName}\0${importBinding.localName}`;
    const isTypeOnly =
      importBinding.isTypeOnly && (mergedBindingByKey.get(bindingKey)?.isTypeOnly ?? true);
    mergedBindingByKey.set(bindingKey, { ...importBinding, isTypeOnly });
  }
  const bindingsByModuleSpecifier = new Map<string, ImportBinding[]>(
    sideEffectModuleSpecifiers.map((moduleSpecifier) => [moduleSpecifier, []]),
  );
  for (const importBinding of mergedBindingByKey.values()) {
    bindingsByModuleSpecifier.set(importBinding.rewrittenModuleSpecifier, [
      ...(bindingsByModuleSpecifier.get(importBinding.rewrittenModuleSpecifier) ?? []),
      importBinding,
    ]);
  }

  const importLines: string[] = [];
  for (const moduleSpecifier of [...bindingsByModuleSpecifier.keys()].sort()) {
    const bindingsOfModuleSpecifier = [
      ...(bindingsByModuleSpecifier.get(moduleSpecifier) ?? []),
    ].sort(compareByLocalName);
    const fromClause = `from '${moduleSpecifier}';`;
    if (bindingsOfModuleSpecifier.length === 0) {
      importLines.push(`import '${moduleSpecifier}';`);
    }
    for (const { localName, isTypeOnly } of bindingsOfModuleSpecifier.filter(
      ({ importedName }) => importedName === 'default',
    )) {
      importLines.push(`import ${isTypeOnly ? 'type ' : ''}${localName} ${fromClause}`);
    }
    for (const { localName, isTypeOnly } of bindingsOfModuleSpecifier.filter(
      ({ importedName }) => importedName === '*',
    )) {
      importLines.push(`import ${isTypeOnly ? 'type ' : ''}* as ${localName} ${fromClause}`);
    }
    const namedBindings = bindingsOfModuleSpecifier.filter(
      ({ importedName }) => importedName !== 'default' && importedName !== '*',
    );
    if (namedBindings.length > 0) {
      const isWholeImportTypeOnly = namedBindings.every(({ isTypeOnly }) => isTypeOnly);
      const importSpecifierList = namedBindings
        .map((importBinding) => formatNamedImportSpecifier(importBinding, isWholeImportTypeOnly))
        .join(', ');
      importLines.push(
        `import ${isWholeImportTypeOnly ? 'type ' : ''}{ ${importSpecifierList} } ${fromClause}`,
      );
    }
  }
  return importLines.join('\n');
};
