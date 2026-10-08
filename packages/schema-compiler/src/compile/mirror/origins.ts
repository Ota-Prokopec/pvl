// Follows a name through imports and re-exports within the scanned set to
// where it is actually bound.
import type { ExportDeclaration } from 'ts-morph';
import { ModuleContextReader, type ModuleContext } from './moduleContextReader.js';
import { TsMorphProject } from './tsMorphProject.js';
import { rewriteModuleSpecifierForOutputDirectory } from './utils.js';

/**
 * The two kinds of {@link Origin}, the tag that tells them apart:
 *
 * `LOCAL` is a top-level declaration of a scanned module, which the mirror
 * copies into the Destination File;
 *
 * `EXTERNAL` is an import from outside the scanned set, which the mirror
 * re-imports in the Destination File instead of copying.
 */
export const ORIGIN_KIND = {
  LOCAL: 'LOCAL',
  EXTERNAL: 'EXTERNAL',
} as const;

/**
 * Where a {@link ORIGIN_KIND.LOCAL} name is bound: a scanned module's own
 * top-level declaration.
 *
 * ```ts
 * // /repo/src/user.ts: export const user = …;
 * { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
 * ```
 */
export type LocalOrigin = {
  kind: typeof ORIGIN_KIND.LOCAL;
  /** Absolute path of the scanned module that declares the name. */
  modulePath: string;
  /** The name as declared in that module, before any renaming for the Destination File. */
  declarationName: string;
};

/**
 * Where a {@link ORIGIN_KIND.EXTERNAL} name is bound: an import from outside
 * the scanned set.
 *
 * ```ts
 * // import { pvl } from '@pvl/schema';
 * { kind: 'EXTERNAL', rewrittenModuleSpecifier: '@pvl/schema', importedName: 'pvl' }
 * ```
 */
export type ExternalOrigin = {
  kind: typeof ORIGIN_KIND.EXTERNAL;
  /** The import's module specifier, already rewritten to resolve from the Destination File. */
  rewrittenModuleSpecifier: string;
  /** The name the other module exports: `'default'` for a default import, `'*'` for a namespace. */
  importedName: string;
};

/** Where a name is bound: in a scanned module, or outside the scanned set. */
export type Origin = LocalOrigin | ExternalOrigin;

/**
 * The read-only data needed to trace a name to its {@link Origin}, built
 * once per mirror by {@link OriginTracer.createOriginLookup} and passed as the first
 * argument to {@link OriginTracer.findExportOrigin} and {@link OriginTracer.findLocalNameOrigin}.
 *
 * Tracing steps from an import into the module it names, then on through
 * that module's own imports and re-exports. So it needs to find a scanned
 * module from a path, to tell whether a module specifier leads into the scanned set
 * or out of it, and to know where external module specifiers are rewritten to.
 *
 * ```ts
 * // post.ts: import { account } from './index.js';
 * // './index.js' resolves to a path in `scannedFilePaths`, so the trace
 * // continues in `moduleContextByPath.get('/repo/src/index.ts')`.
 * // An import of '@pvl/schema' resolves to none, so the trace ends there as
 * // an EXTERNAL origin whose module specifier is rewritten for `outputDirectory`.
 * ```
 */
export type OriginLookup = {
  /** Every scanned module, by its absolute path. */
  moduleContextByPath: ReadonlyMap<string, ModuleContext>;
  /** Absolute paths of the scanned modules, to tell an import into the set from one out of it. */
  scannedFilePaths: ReadonlySet<string>;
  /** Directory of the Destination File, which external module specifiers are rewritten to resolve from. */
  outputDirectory: string;
};

/** The arguments of {@link OriginTracer.createOriginLookup}. */
export type CreateOriginLookupArgs = {
  /** Every scanned module, in any order. */
  moduleContexts: ReadonlyArray<ModuleContext>;
  /** Absolute paths of the scanned modules. */
  scannedFilePaths: ReadonlySet<string>;
  /** Directory of the Destination File. */
  outputDirectory: string;
};

// The state of tracing one name to its origin: the read-only `originLookup`
// plus a record of the exports followed so far. Each public `find…Origin`
// call makes a fresh one and passes it down every hop of that trace, from
// import to export to re-export, so one trace never sees another's record.
//
//   // a.ts: export { x } from './b.js';
//   // b.ts: export { x } from './a.js';   // a cycle back to a.ts
//   // Tracing a.ts's `x`: visits `a.ts:x`, then `b.ts:x`, then reaches
//   // `a.ts:x` again, finds it visited, and ends with no origin.
type OriginResolution = {
  originLookup: OriginLookup;
  // Each `<module path>:<exported name>` already followed, so a re-export
  // cycle ends instead of looping; only a type-only cycle can form one, as
  // IMPORT_CYCLE blocks the rest.
  visitedExportKeys: Set<string>;
};

type FollowReExportArgs = {
  resolution: OriginResolution;
  // The module that contains `exportDeclaration`.
  modulePath: string;
  exportDeclaration: ExportDeclaration;
  // The export name being looked for.
  exportedName: string;
};

/**
 * Traces a name through imports and re-exports to the {@link Origin} it is
 * bound at: a declaration of a scanned module (`LOCAL`), or an import from
 * outside the scanned set (`EXTERNAL`).
 *
 * **Purpose.** The mirror copies every scanned module into one Destination
 * File, so it can't keep the imports between them. For each name a module
 * imports or exports it has to know which declaration that name ends at,
 * however many imports and re-exports lie on the way, to emit that
 * declaration once, give it one final name, and point every reference at
 * that name. A name that ends outside the set is re-imported instead.
 *
 * **Usage.** Build an {@link OriginLookup} once per mirror, then trace
 * names against it; key maps by {@link OriginTracer.toOriginKey}.
 *
 * Given the scanned modules:
 *
 * ```ts
 * // user.ts:  import { pvl } from '@pvl/schema';
 * //           export const user = pvl.object({ … });
 * // index.ts: export { user as account } from './user.js';
 * // post.ts:  import { account } from './index.js';
 * ```
 *
 * - `createOriginLookup({ moduleContexts, scannedFilePaths, outputDirectory })`
 *   indexes the scanned modules by path. In: every scanned module's
 *   {@link ModuleContext}, their absolute paths, and the Destination File's
 *   directory. Out: the {@link OriginLookup} the two `find…` methods take.
 *
 *   ```ts
 *   const lookup = OriginTracer.createOriginLookup({
 *     moduleContexts: [userContext, indexContext, postContext],
 *     scannedFilePaths: new Set(['/repo/src/user.ts', '/repo/src/index.ts', '/repo/src/post.ts']),
 *     outputDirectory: '/repo/generated',
 *   });
 *   ```
 *
 * - `findLocalNameOrigin(lookup, moduleContext, localName)` traces a name
 *   used inside a module: one it declares or imports. In: the lookup, the
 *   module and the name. Out: always an origin; the module's own
 *   declaration when the name isn't imported.
 *
 *   ```ts
 *   OriginTracer.findLocalNameOrigin(lookup, postContext, 'account')
 *   // { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
 *   OriginTracer.findLocalNameOrigin(lookup, userContext, 'pvl')
 *   // { kind: 'EXTERNAL', rewrittenModuleSpecifier: '@pvl/schema', importedName: 'pvl' }
 *   OriginTracer.findLocalNameOrigin(lookup, userContext, 'user')
 *   // { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
 *   ```
 *
 * - `findExportOrigin(lookup, modulePath, exportedName)` traces a name a
 *   module exports, as seen from outside it. In: the lookup, the module's
 *   absolute path and the exported name (`'default'` for its default
 *   export). Out: the origin, or `undefined` when the path isn't a scanned
 *   module or it has no such export.
 *
 *   ```ts
 *   OriginTracer.findExportOrigin(lookup, '/repo/src/index.ts', 'account')
 *   // { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
 *   OriginTracer.findExportOrigin(lookup, '/repo/src/index.ts', 'missing')
 *   // undefined
 *   ```
 *
 * - `toOriginKey(origin)` turns an origin into a string that is equal for
 *   two origins exactly when they are the same binding, to key a `Map` or
 *   `Set` by binding. In: any origin. Out: `local:<path>:<name>` or
 *   `external:<module specifier>:<imported name>`.
 *
 *   ```ts
 *   OriginTracer.toOriginKey(OriginTracer.findLocalNameOrigin(lookup, postContext, 'account'))
 *   // 'local:/repo/src/user.ts:user'
 *   OriginTracer.toOriginKey(OriginTracer.findLocalNameOrigin(lookup, userContext, 'pvl'))
 *   // 'external:@pvl/schema:pvl'
 *   ```
 */
export class OriginTracer {
  /**
   * Turns an origin into a string that identifies its binding, so a `Map` or
   * `Set` can be keyed by binding. Origins are objects, and two objects with
   * the same fields are still different keys; this string is equal for two
   * origins exactly when every field that identifies the binding is equal.
   *
   * Two names that reach the same declaration through different imports or
   * re-exports resolve to the same origin, and so to the same key. The mirror
   * uses that to emit such a declaration once, to give it one final name, and
   * to tell a repeated export of one binding from two different bindings
   * exported under one name.
   *
   * The `local:` and `external:` prefix keeps a local and an external binding
   * from ever sharing a key.
   *
   * ```ts
   * OriginTracer.toOriginKey({ kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' })
   * // 'local:/repo/src/user.ts:user'
   * OriginTracer.toOriginKey({ kind: 'EXTERNAL', rewrittenModuleSpecifier: '@pvl/schema', importedName: 'pvl' })
   * // 'external:@pvl/schema:pvl'
   * ```
   */
  public static toOriginKey(origin: Origin): string {
    return origin.kind === ORIGIN_KIND.LOCAL
      ? `local:${origin.modulePath}:${origin.declarationName}`
      : `external:${origin.rewrittenModuleSpecifier}:${origin.importedName}`;
  }

  /**
   * Indexes every scanned module by its path, so
   * {@link OriginTracer.findExportOrigin} and
   * {@link OriginTracer.findLocalNameOrigin} can step from an import into
   * the module it names.
   */
  public static createOriginLookup({
    moduleContexts,
    scannedFilePaths,
    outputDirectory,
  }: CreateOriginLookupArgs): OriginLookup {
    return {
      moduleContextByPath: new Map(
        moduleContexts.map((moduleContext) => [moduleContext.scannedModule.path, moduleContext]),
      ),
      scannedFilePaths,
      outputDirectory,
    };
  }

  // Where module `targetPath`'s export `exportedName` is bound; always an
  // origin, unlike `followExport`, which returns `undefined` when it finds
  // none. Used where an import or re-export has already named a scanned
  // target, so there is a module to point at even if the export is missing.
  //
  // When `followExport` finds none, because the module has no such export
  // (which TypeScript would have rejected) or the export was already followed
  // in this resolution (a cycle), the reference is kept as written, as a
  // LOCAL binding `exportedName` of that module. The mirror then treats it
  // like any other declaration of that module instead of failing here:
  //
  //   // user.ts exports `user` only
  //   import { user } from './user.js';     // → user.ts's export `user`, followed
  //   import { missing } from './user.js';  // → LOCAL user.ts `missing`, kept
  private static followExportOrKeepReference(
    resolution: OriginResolution,
    targetPath: string,
    exportedName: string,
  ): Origin {
    return (
      OriginTracer.followExport(resolution, targetPath, exportedName) ?? {
        kind: ORIGIN_KIND.LOCAL,
        modulePath: targetPath,
        declarationName: exportedName,
      }
    );
  }

  // Where the top-level name `localName` of a module is bound, following
  // imports into the scanned set until it reaches a declaration or leaves
  // the set. In post.ts:
  //
  //   const draft = …;                    // `draft` → LOCAL post.ts `draft`
  //   import { pvl } from '@pvl/schema';  // `pvl`   → EXTERNAL '@pvl/schema' `pvl`
  //   import { user } from './user.js';   // `user`  → wherever user.ts's export
  //                                       //           `user` is bound
  private static followLocalName(
    resolution: OriginResolution,
    moduleContext: ModuleContext,
    localName: string,
  ): Origin {
    const importBinding = moduleContext.importBindings.find(
      (candidateBinding) => candidateBinding.localName === localName,
    );

    if (importBinding === undefined) {
      // There is no import binding -> if has to be a local variable
      return {
        kind: ORIGIN_KIND.LOCAL,
        modulePath: moduleContext.scannedModule.path,
        declarationName: localName,
      };
    }

    if (importBinding.scannedTargetPath === undefined) {
      return {
        kind: ORIGIN_KIND.EXTERNAL,
        rewrittenModuleSpecifier: importBinding.rewrittenModuleSpecifier,
        importedName: importBinding.importedName,
      };
    }

    return OriginTracer.followExportOrKeepReference(
      resolution,
      importBinding.scannedTargetPath,
      importBinding.importedName,
    );
  }

  /**
   * Checks one `export … from '…'` declaration of module `modulePath` for
   * the export `exportedName`, and returns where it binds it, or `undefined`
   * when this declaration doesn't provide that name, so the caller can try the
   * module's next export declaration. Used by `followExport` as the last
   * resort, after the module's own declarations and local exports.
   *
   * The declaration's target decides what happens next. A target in the
   * scanned set is followed further, to wherever its export is bound. One
   * outside the set ends the trace as an EXTERNAL origin, with the module specifier
   * rewritten to resolve from the Destination File.
   *
   * Looking for `user`:
   *
   * ```ts
   * export { user } from './user.js';          // → user.ts's export `user`
   * export { account as user } from './a.js';  // → a.ts's export `account`
   * export * from './user.js';                 // → user.ts's export `user`, if any
   * export * as user from 'some-package';      // → EXTERNAL 'some-package' `*`
   * export { user } from 'some-package';       // → EXTERNAL 'some-package' `user`
   * export * from 'some-package';              // → undefined: unknown names
   * export { post } from './post.js';          // → undefined: not `user`
   * export { user };                           // → undefined: not a re-export
   * ```
   *
   * A named re-export matches by the name it is exported under (`user` in
   * `account as user`) but follows the name it takes from the target
   * (`account`). `export *` never re-exports a default, so it never matches
   * `default`, and from outside the set it can't be searched, so it matches
   * nothing.
   */
  private static followReExport({
    resolution,
    modulePath,
    exportDeclaration,
    exportedName,
  }: FollowReExportArgs): Origin | undefined {
    const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();
    if (moduleSpecifier === undefined) {
      return undefined;
    }

    const absoluteTargetPath = TsMorphProject.findAbsoluteScannedFilePath(
      moduleSpecifier,
      modulePath,
      resolution.originLookup.scannedFilePaths,
    );

    const rewrittenModuleSpecifier = rewriteModuleSpecifierForOutputDirectory(
      moduleSpecifier,
      modulePath,
      resolution.originLookup.outputDirectory,
    );

    const namespaceExportNode = exportDeclaration.getNamespaceExport();
    if (namespaceExportNode !== undefined) {
      return namespaceExportNode.getName() === exportedName
        ? { kind: ORIGIN_KIND.EXTERNAL, rewrittenModuleSpecifier, importedName: '*' }
        : undefined;
    }

    const namedExports = exportDeclaration.getNamedExports();
    if (namedExports.length === 0) {
      // `export *` never re-exports a default.
      return absoluteTargetPath === undefined || exportedName === 'default'
        ? undefined
        : OriginTracer.followExport(resolution, absoluteTargetPath, exportedName);
    }

    const matchingExportSpecifier = namedExports.find(
      (exportSpecifier) =>
        ModuleContextReader.getAliasOrOwnNameOfImportOrExportSpecifier(exportSpecifier) ===
        exportedName,
    );
    if (matchingExportSpecifier === undefined) {
      return undefined;
    }

    return absoluteTargetPath === undefined
      ? {
          kind: ORIGIN_KIND.EXTERNAL,
          rewrittenModuleSpecifier,
          importedName: matchingExportSpecifier.getName(),
        }
      : OriginTracer.followExportOrKeepReference(
          resolution,
          absoluteTargetPath,
          matchingExportSpecifier.getName(),
        );
  }

  /**
   * Finds where the export `exportedName` of the scanned module `modulePath`
   * really comes from: the declaration it ends at, or the import from outside
   * the scanned set. An export is often not a declaration but a pointer to
   * something else, a name that stands for another name, or a re-export from
   * another module, so this follows it hop by hop, through as many modules as
   * it takes.
   *
   * It is `findExportOrigin` without the setup: the caller supplies the
   * resolution in progress, so the other `follow…` functions can call it
   * midway through a trace, when it steps into the next module.
   *
   * Returns `undefined` when:
   * - `modulePath` isn't a scanned module, so there is nothing to look in;
   * - the export was already followed in this resolution, which means a
   *   re-export cycle, so the trace ends instead of looping;
   * - the module has no such export, and no re-export in it provides one.
   *
   * Otherwise it asks the module's own source, from the most direct form of
   * export to the least, and the first that provides `exportedName` wins:
   *
   * 1. A name exported by name or as the default, `export { user }` or
   *    `export default user`. The exported name stands for another name in
   *    the module, which may itself be an import, so the trace continues
   *    from that name (`followLocalName`).
   * 2. A declaration carrying `export`, `export const user = …`. The trace
   *    ends at that declaration, a LOCAL origin.
   * 3. Each `export … from '…'` declaration in turn (`followReExport`), which
   *    sends the trace on to another module or out of the scanned set.
   *
   * ```ts
   * // user.ts: import { base } from './base.js'; export { base as user };
   * OriginTracer.followExport(resolution, '/repo/src/user.ts', 'user')
   * // form 1: `user` stands for `base`, an import, so the trace goes on into
   * // base.ts's export `base`
   *
   * // user.ts: export const user = …;
   * OriginTracer.followExport(resolution, '/repo/src/user.ts', 'user')
   * // form 2: { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
   *
   * // index.ts: export { user } from './user.js';
   * OriginTracer.followExport(resolution, '/repo/src/index.ts', 'user')
   * // form 3: continues into user.ts's export `user`
   * ```
   */
  private static followExport(
    resolution: OriginResolution,
    modulePath: string,
    exportedName: string,
  ): Origin | undefined {
    const moduleContext = resolution.originLookup.moduleContextByPath.get(modulePath);
    if (
      moduleContext === undefined ||
      resolution.visitedExportKeys.has(`${modulePath}:${exportedName}`)
    ) {
      return undefined;
    }
    resolution.visitedExportKeys.add(`${modulePath}:${exportedName}`);
    const aliasedName = moduleContext.aliasedNameByExportedName.get(exportedName);
    if (aliasedName !== undefined) {
      return OriginTracer.followLocalName(resolution, moduleContext, aliasedName);
    }
    const declarationName = moduleContext.declarationNameByExportedName.get(exportedName);
    if (declarationName !== undefined) {
      return { kind: ORIGIN_KIND.LOCAL, modulePath, declarationName };
    }
    for (const exportDeclaration of moduleContext.scannedModule.sourceFile.getExportDeclarations()) {
      const reExportOrigin = OriginTracer.followReExport({
        resolution,
        modulePath,
        exportDeclaration,
        exportedName,
      });
      if (reExportOrigin !== undefined) {
        return reExportOrigin;
      }
    }
    return undefined;
  }

  /**
   * Finds the origin behind a name that a module exports: where the thing
   * `modulePath` exports as `exportedName` is really bound, however many
   * re-exports and imports it passed through to get there. Use it when what
   * you hold is a name seen from outside a module, as in
   * `export { account } from './index.js'`. To start from a name used inside
   * a module, use {@link OriginTracer.findLocalNameOrigin}.
   *
   * Returns:
   * - a `LOCAL` origin when the trace ends at a declaration of a scanned
   *   module, which can be a different module than `modulePath`;
   * - an `EXTERNAL` origin when it ends at an import from outside the scanned
   *   set;
   * - `undefined` when `modulePath` isn't a scanned module or has no export
   *   named `exportedName`.
   *
   * The exported name and the declaration's name can differ, as in the
   * example, where the export `account` is the declaration `user`.
   *
   * ```ts
   * // index.ts: export { user as account } from './user.js';
   * // user.ts:  import { base } from './base.js'; export const user = base;
   * OriginTracer.findExportOrigin(lookup, '/repo/src/index.ts', 'account')
   * // { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
   *
   * OriginTracer.findExportOrigin(lookup, '/repo/src/index.ts', 'missing')
   * // undefined: index.ts exports no `missing`
   * ```
   */
  public static findExportOrigin(
    originLookup: OriginLookup,
    modulePath: string,
    exportedName: string,
  ): Origin | undefined {
    return OriginTracer.followExport(
      { originLookup, visitedExportKeys: new Set() },
      modulePath,
      exportedName,
    );
  }

  /**
   * Where the top-level name `localName` of a module is actually bound: the
   * module's own declaration, or, for an import, the declaration in the
   * scanned set it leads to, or the import from outside the set it ends at.
   *
   * ```ts
   * // post.ts: import { account } from './index.js';
   * // index.ts: export { user as account } from './user.js';
   * OriginTracer.findLocalNameOrigin(lookup, postContext, 'account')
   * // { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
   * ```
   */
  public static findLocalNameOrigin(
    originLookup: OriginLookup,
    moduleContext: ModuleContext,
    localName: string,
  ): Origin {
    return OriginTracer.followLocalName(
      { originLookup, visitedExportKeys: new Set() },
      moduleContext,
      localName,
    );
  }
}
