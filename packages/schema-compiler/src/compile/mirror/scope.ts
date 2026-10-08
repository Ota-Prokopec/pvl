// Joins the modules into the Destination File's one top-level scope. An
// import into the set collapses into a reference to the binding it names.
// Exported names keep theirs; every other binding takes its name unless a
// different binding already has it, and is renamed to `<name>_<n>` otherwise.
import {
  ModuleContextReader,
  type ImportBinding,
  type ModuleContext,
} from './moduleContextReader.js';
import { ORIGIN_KIND, OriginTracer, type LocalOrigin, type OriginLookup } from './origins.js';
import { findFreeName } from './utils.js';

/** An import into the set that becomes a reference to `bindingOrigin`. */
type CollapsedImport = {
  /** The import to remove; its references are renamed to the declaration's final name. */
  importBinding: ImportBinding;
  /** The declaration in the scanned set the import ends up at. */
  bindingOrigin: LocalOrigin;
};

type SeparateCollapsedAndExternalImportsPayload = {
  /** The imports that point at a declaration in the scanned set. */
  collapsedImports: CollapsedImport[];
  /** The imports that stay in the import block, re-exports from outside the set already resolved to their source. */
  externalImports: ImportBinding[];
};

export type JoinIntoOneTopLevelScopePayload = {
  /** Origin key → the name a non-exported declaration ended up with. */
  finalNameByOriginKey: Map<string, string>;
  /** The imports from outside the set, under their final local names, for the import block. */
  externalImports: ImportBinding[];
};

export type JoinIntoOneTopLevelScopeArgs = {
  /** In emission order: an earlier module keeps a contested name. */
  moduleContexts: ReadonlyArray<ModuleContext>;
  originLookup: OriginLookup;
};

/**
 * Joins the scanned modules into the Destination File's one top-level scope.
 * Each scanned module has a top-level scope of its own, but the Destination
 * File has just one: two modules declaring `format` would clash there, and an
 * import of one scanned module from another can't stay an import. The class
 * renames bindings in the modules' ts-morph source files so that no two
 * bindings share a name, and points every import into the scanned set at
 * the final name of the declaration it reaches.
 *
 * Who keeps a contested name:
 * 1. An exported declaration always does, because renaming it would change
 *    the Destination File's exports.
 * 2. Otherwise the module emitted first does, and within a module its
 *    non-exported declarations come before its imports from outside the set.
 * 3. The same import from outside the set in several modules is no clash:
 *    they share one import and one name.
 *
 * A binding that loses is renamed to the first free `<name>_<n>`, counting
 * from 2, along with every reference to it in its module.
 *
 * Public method:
 *
 * - `join(args)`
 *   - **Input**, a `JoinIntoOneTopLevelScopeArgs`:
 *     - `moduleContexts`: the scanned modules in emission order, each with
 *       its ts-morph source file, imports and declared names.
 *     - `originLookup`: the lookup from `OriginTracer.createOriginLookup`,
 *       used to trace each import to the declaration it reaches.
 *   - **Output**, a `JoinIntoOneTopLevelScopePayload`:
 *     - `finalNameByOriginKey`: origin key → the name each non-exported
 *       declaration ended up with, its own name unless it clashed. Exported
 *       declarations aren't in it, as they keep their names.
 *     - `externalImports`: the imports from outside the scanned set under
 *       their final local names, for the import block. An import of a
 *       scanned module that only re-exports from outside the set
 *       (`export { pvl } from '@pvl/schema'`) is in it as an import straight
 *       from that outside module.
 *   - **Reports nothing**: it raises no diagnostics, as every clash is
 *     resolved by renaming.
 *   - **Side effect**: it renames identifiers in the modules' source files in
 *     place, and updates `localName` of each renamed external import. Plan
 *     anything that needs the names as written (the exports) before calling it.
 *
 *   ```ts
 *   // user.ts (emitted first)
 *   import { pvl } from '@pvl/schema';
 *   const format = …;
 *   export const user = …;
 *
 *   // post.ts (emitted second)
 *   import { pvl } from '@pvl/schema';
 *   import { user as author } from './user.js';
 *   const format = …;
 *   export const post = pvl.object({ author, by: format });
 *
 *   TopLevelScopeJoiner.join({ moduleContexts: [userContext, postContext], originLookup });
 *   // finalNameByOriginKey: 'local:/repo/src/user.ts:format' → 'format',
 *   //                       'local:/repo/src/post.ts:format' → 'format_2'
 *   // externalImports:      `pvl` of user.ts and of post.ts, sharing the name `pvl`
 *   // post.ts afterwards:   const format_2 = …;
 *   //                       export const post = pvl.object({ author: user, by: format_2 });
 *   ```
 */
export class TopLevelScopeJoiner {
  // Splits every import of every module into `collapsedImports`, which point
  // at a declaration in the scanned set and become plain references to it,
  // and `externalImports`, which stay imports in the Destination File's
  // import block.
  //
  //   import { user } from './user.js';       // collapsed: user.ts declares `user`
  //   import { pvl } from '@pvl/schema';      // external
  //   import { pvl } from './reexports.js';   // external, when reexports.ts is
  //                                           // `export { pvl } from '@pvl/schema'`:
  //                                           // becomes `import { pvl } from '@pvl/schema'`
  private static separateCollapsedAndExternalImports(
    moduleContexts: ReadonlyArray<ModuleContext>,
    originLookup: OriginLookup,
  ): SeparateCollapsedAndExternalImportsPayload {
    const collapsedImports: CollapsedImport[] = [];
    const externalImports: ImportBinding[] = [];

    for (const moduleContext of moduleContexts) {
      for (const importBinding of moduleContext.importBindings) {
        const bindingOrigin =
          importBinding.scannedTargetPath === undefined
            ? undefined
            : OriginTracer.findLocalNameOrigin(
                originLookup,
                moduleContext,
                importBinding.localName,
              );

        if (bindingOrigin === undefined) {
          // It binds outside of the scanning scope
          externalImports.push(importBinding);
        } else if (bindingOrigin.kind === ORIGIN_KIND.LOCAL) {
          // It is in a scanning scope
          collapsedImports.push({ importBinding, bindingOrigin });
        } else {
          // It imports from a module in the scanning scope, but that module only
          // re-exports the binding from outside it (`export { pvl } from '@pvl/schema'`).
          // The import is rewritten to import straight from that outside module.
          const { rewrittenModuleSpecifier, importedName } = bindingOrigin;
          externalImports.push({
            ...importBinding,
            rewrittenModuleSpecifier,
            importedName,
            scannedTargetPath: undefined,
          });
        }
      }
    }
    return { collapsedImports, externalImports };
  }

  // Picks the name a binding gets in the Destination File's one top-level
  // scope, and reserves it in `ownerKeyByName` so no later binding gets it.
  // `name` is the one the binding would like. `ownerKey` identifies the
  // binding, so a repeat claim by the same binding is told apart from a claim
  // by another one: a declaration's is its origin key (`local:a.ts:user`), and
  // every module importing the same export under the same local name shares
  // one, so they share one import and one name.
  //
  // - `name` is free, or already reserved by this same binding: it gets `name`.
  // - `name` belongs to another binding: it gets the first free `<name>_<n>`,
  //   counting from 2.
  //
  //   claimUniqueName(owners, 'user', 'local:a.ts:user')  // 'user'
  //   claimUniqueName(owners, 'user', 'local:a.ts:user')  // 'user': same binding
  //   claimUniqueName(owners, 'user', 'local:b.ts:user')  // 'user_2'
  //   claimUniqueName(owners, 'user', 'local:c.ts:user')  // 'user_3'
  private static claimUniqueName(
    ownerKeyByName: Map<string, string>,
    name: string,
    ownerKey: string,
  ): string {
    const currentOwner = ownerKeyByName.get(name);
    const claimedName =
      currentOwner === undefined || currentOwner === ownerKey
        ? name // It is the owner of this name or the name has not been taken
        : findFreeName(name, (candidate) => ownerKeyByName.has(candidate)); // The name has already been taken and it is not the owner of the name -> has to find first free name

    ownerKeyByName.set(claimedName, ownerKey);

    return claimedName;
  }

  // The origin key of the declaration `declarationName` in the module at
  // `modulePath`, which is also its owner key.
  //
  //   toLocalOriginKey('/repo/src/user.ts', 'user') // 'local:/repo/src/user.ts:user'
  private static toLocalOriginKey(modulePath: string, declarationName: string): string {
    return OriginTracer.toOriginKey({ kind: ORIGIN_KIND.LOCAL, modulePath, declarationName });
  }

  // The owner key of an import from outside the scanned set: the same for
  // every module importing the same export under the same local name, so
  // they share one import and one name in the Destination File.
  //
  //   import { pvl } from '@pvl/schema';       // in user.ts and post.ts: one owner
  //   import { pvl as p } from '@pvl/schema';  // a different owner: name `p`
  private static toExternalImportOwnerKey({
    rewrittenModuleSpecifier,
    importedName,
    localName,
  }: ImportBinding): string {
    return `${OriginTracer.toOriginKey({ kind: ORIGIN_KIND.EXTERNAL, rewrittenModuleSpecifier, importedName })}:${localName}`;
  }

  // Gives every top-level binding (a declaration, or an import from outside
  // the set) a name no other binding has, renaming one that clashes to
  // `<name>_<n>` along with its references in its module. Exported
  // declarations are reserved first; then the modules are visited in
  // emission order, each one's declarations before its imports.
  //
  //   // user.ts (emitted first)            // post.ts (emitted second)
  //   import { pvl } from '@pvl/schema';    import { pvl } from '@pvl/schema';  // shared: `pvl`
  //   const format = …;                     const format = …;                    // → format_2
  //   export const user = …;                const user = …;                      // → user_2
  //
  // Returns each non-exported declaration's final name by origin key, and
  // updates each external import's `localName` in place.
  private static assignUniqueTopLevelNames(
    moduleContexts: ReadonlyArray<ModuleContext>,
    externalImports: ReadonlyArray<ImportBinding>,
  ): Map<string, string> {
    const ownerKeyByName = new Map<string, string>(
      moduleContexts.flatMap(({ scannedModule, declaredNames }) =>
        declaredNames
          .filter(({ isExportedUnderOwnName }) => isExportedUnderOwnName)
          .map(({ declarationName }): [string, string] => [
            declarationName,
            TopLevelScopeJoiner.toLocalOriginKey(scannedModule.path, declarationName),
          ]),
      ),
    );

    const finalNameByOriginKey = new Map<string, string>();
    for (const { scannedModule, declaredNames } of moduleContexts) {
      declaredNames
        .filter(({ isExportedUnderOwnName }) => !isExportedUnderOwnName)
        .forEach(({ declarationName, nameIdentifier }) => {
          const originKey = TopLevelScopeJoiner.toLocalOriginKey(
            scannedModule.path,
            declarationName,
          );
          const uniqueName = TopLevelScopeJoiner.claimUniqueName(
            ownerKeyByName,
            declarationName,
            originKey,
          );
          if (uniqueName !== declarationName) {
            ModuleContextReader.renameAvoidingShadowing(nameIdentifier, uniqueName);
          }
          finalNameByOriginKey.set(originKey, uniqueName);
        });

      externalImports
        .filter(({ importerPath }) => importerPath === scannedModule.path)
        .forEach((importBinding) => {
          const uniqueName = TopLevelScopeJoiner.claimUniqueName(
            ownerKeyByName,
            importBinding.localName,
            TopLevelScopeJoiner.toExternalImportOwnerKey(importBinding),
          );
          if (uniqueName !== importBinding.localName) {
            ModuleContextReader.renameImportBinding(importBinding, uniqueName);
            importBinding.localName = uniqueName;
          }
        });
    }
    return finalNameByOriginKey;
  }

  /**
   * Renames the bindings across the scanned modules' source files so they
   * can share the Destination File's single top-level scope: no two bindings
   * share a name, and every import into the scanned set is renamed to the
   * final name of the declaration it points at, so the import can be removed
   * and its references keep working.
   *
   * ```ts
   * // user.ts: const format = …; export const user = …;
   * // post.ts: import { user as author } from './user.js'; const format = …;
   * //          export const post = pvl.object({ author, by: format });
   *
   * // In the Destination File:
   * const format = …; export const user = …;
   * const format_2 = …;
   * export const post = pvl.object({ author: user, by: format_2 });
   * ```
   *
   * Returns the final names of the renamed declarations, for the export
   * rewrites, and the imports from outside the set, for the import block.
   */
  public static join({
    moduleContexts,
    originLookup,
  }: JoinIntoOneTopLevelScopeArgs): JoinIntoOneTopLevelScopePayload {
    const { collapsedImports, externalImports } =
      TopLevelScopeJoiner.separateCollapsedAndExternalImports(moduleContexts, originLookup);

    const finalNameByOriginKey = TopLevelScopeJoiner.assignUniqueTopLevelNames(
      moduleContexts,
      externalImports,
    );

    for (const { importBinding, bindingOrigin } of collapsedImports) {
      const finalName =
        finalNameByOriginKey.get(OriginTracer.toOriginKey(bindingOrigin)) ??
        bindingOrigin.declarationName;

      if (importBinding.localName !== finalName) {
        ModuleContextReader.renameImportBinding(importBinding, finalName);
      }
    }
    return { finalNameByOriginKey, externalImports };
  }
}
