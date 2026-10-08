// Every name the Destination File exports and the binding behind it. A
// re-export whose binding lives elsewhere forwards to that binding, and is
// dropped when the binding is already exported under the same name.
import type { ExportDeclaration, ExportSpecifier, SourceFile } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { ModuleContextReader, type ModuleContext } from './moduleContextReader.js';
import { TsMorphProject } from './tsMorphProject.js';
import { toDisplayPath, rewriteModuleSpecifierForOutputDirectory } from './utils.js';
import { ORIGIN_KIND, OriginTracer, type Origin, type OriginLookup } from './origins.js';

/** One name a module exports, and the binding behind it. */
export type ExportedBinding = {
  exportedName: string;
  bindingOrigin: Origin;
};

/** One exported name of a re-export whose binding isn't the module's own. */
export type ForwardedExport = ExportedBinding & {
  isTypeOnly: boolean;
};

/**
 * How one export declaration is rewritten: `forwardedNames` holds every name
 * it forwards, `forwardsToEmit` only those still to be exported from it.
 */
export type ExportDeclarationRewrite = {
  forwardedNames: Set<string>;
  forwardsToEmit: ForwardedExport[];
};

export type PlanExportsPayload = {
  diagnostics: Diagnostic[];
  /** The export declarations to rewrite; any other keeps its text, its module specifier rewritten. */
  rewriteByDeclaration: Map<ExportDeclaration, ExportDeclarationRewrite>;
};

// What one export declaration exports: the names bound where it points,
// registered as they are, and the ones forwarded from elsewhere in the set.
// A declaration that `needsRewrite` is replaced by its forwards.
type ExportDeclarationContents = {
  ownExports: ExportedBinding[];
  forwardedExports: ForwardedExport[];
  needsRewrite: boolean;
};

// The names a module exports from its own declarations and its
// `export default`, each with the binding behind it.
//
//   export const user = …;                // `user` → user.ts `user`
//   export default function format() {}   // `default` → user.ts `format`
//   import { base } from './base.js';
//   export default base;                  // `default` → base.ts's export `base`
//
// `export { … }` and `export … from` are read by
// `classifyExportDeclaration` instead.
const readDeclaredExports = (
  originLookup: OriginLookup,
  moduleContext: ModuleContext,
): ExportedBinding[] => {
  const { path, sourceFile } = moduleContext.scannedModule;
  const exportedBindings: ExportedBinding[] = [...moduleContext.declarationNameByExportedName].map(
    ([exportedName, localName]) => ({
      exportedName,
      bindingOrigin: { kind: ORIGIN_KIND.LOCAL, modulePath: path, declarationName: localName },
    }),
  );
  if (
    sourceFile.getExportAssignments().some((exportAssignment) => !exportAssignment.isExportEquals())
  ) {
    const aliasedName = moduleContext.aliasedNameByExportedName.get('default');
    const bindingOrigin: Origin =
      aliasedName === undefined
        ? { kind: ORIGIN_KIND.LOCAL, modulePath: path, declarationName: 'default' }
        : OriginTracer.findLocalNameOrigin(originLookup, moduleContext, aliasedName);
    exportedBindings.push({ exportedName: 'default', bindingOrigin });
  }
  return exportedBindings;
};

// Whether one name of an export declaration exports only a type.
//
//   export type { User } from './user.js';  // true: the whole declaration
//   export { type User, user };             // true for `User`, false for `user`
const isTypeOnlyExport = (
  exportDeclaration: ExportDeclaration,
  exportSpecifier: ExportSpecifier,
): boolean => {
  return exportDeclaration.isTypeOnly() || exportSpecifier.isTypeOnly();
};

// Whether the binding behind `exportedBinding` is declared in module `path`
// itself, rather than imported from another scanned file.
//
//   // in post.ts
//   const post = …; export { post };                     // true
//   import { user } from './user.js'; export { user };   // false: bound in user.ts
const isBoundInModule = ({ bindingOrigin }: ExportedBinding, path: string): boolean => {
  return bindingOrigin.kind === ORIGIN_KIND.LOCAL && bindingOrigin.modulePath === path;
};

type ClassifyExportDeclarationArgs = {
  originLookup: OriginLookup;
  moduleContext: ModuleContext;
  exportDeclaration: ExportDeclaration;
};

// Sorts the names one export declaration exports into `ownExports`, bound
// in the module itself or outside the scanned set and kept as written, and
// `forwardedExports`, bound in another scanned file. A declaration with any
// forward `needsRewrite`, since its module specifier points at a file the
// Destination File no longer imports.
//
//   export { post };                          // own, kept
//   import { user } from './user.js';
//   export { user };                          // forwarded to user.ts `user`
//   export { pvl } from '@pvl/schema';        // own, kept: outside the set
//   export * as helpers from '../helpers.js'; // own, kept: a namespace from outside
//   export { user as account } from './user.js';
//                                             // forwarded to user.ts `user`
//   export * from './user.js';                // dropped: user.ts exports its own names
const classifyExportDeclaration = ({
  originLookup,
  moduleContext,
  exportDeclaration,
}: ClassifyExportDeclarationArgs): ExportDeclarationContents => {
  const { path } = moduleContext.scannedModule;
  const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();
  const namedExports = exportDeclaration.getNamedExports();
  if (moduleSpecifier === undefined) {
    // `export { … }`: a name bound in this module stays as written.
    const exportedBindings = namedExports.map((exportSpecifier) => ({
      exportedName: ModuleContextReader.getAliasOrOwnNameOfImportOrExportSpecifier(exportSpecifier),
      bindingOrigin: OriginTracer.findLocalNameOrigin(
        originLookup,
        moduleContext,
        exportSpecifier.getName(),
      ),
      isTypeOnly: isTypeOnlyExport(exportDeclaration, exportSpecifier),
    }));
    const forwardedExports = exportedBindings.filter(
      (exportedBinding) => !isBoundInModule(exportedBinding, path),
    );
    const ownExports = exportedBindings.filter((exportedBinding) =>
      isBoundInModule(exportedBinding, path),
    );
    return { ownExports, forwardedExports, needsRewrite: forwardedExports.length > 0 };
  }
  const scannedTargetPath = TsMorphProject.findAbsoluteScannedFilePath(
    moduleSpecifier,
    path,
    originLookup.scannedFilePaths,
  );
  const rewrittenModuleSpecifier = rewriteModuleSpecifierForOutputDirectory(
    moduleSpecifier,
    path,
    originLookup.outputDirectory,
  );
  const namespaceExportNode = exportDeclaration.getNamespaceExport();
  if (namespaceExportNode !== undefined) {
    const bindingOrigin: Origin = {
      kind: ORIGIN_KIND.EXTERNAL,
      rewrittenModuleSpecifier,
      importedName: '*',
    };
    return {
      ownExports: [{ exportedName: namespaceExportNode.getName(), bindingOrigin }],
      forwardedExports: [],
      needsRewrite: false,
    };
  }
  if (scannedTargetPath === undefined) {
    const ownExports = namedExports.map((exportSpecifier) => ({
      exportedName: ModuleContextReader.getAliasOrOwnNameOfImportOrExportSpecifier(exportSpecifier),
      bindingOrigin: {
        kind: ORIGIN_KIND.EXTERNAL,
        rewrittenModuleSpecifier,
        importedName: exportSpecifier.getName(),
      } satisfies Origin,
    }));
    return { ownExports, forwardedExports: [], needsRewrite: false };
  }
  // Into the set: `export *` is dropped, as every name it re-exports is
  // already exported by the module that binds it.
  const forwardedExports = namedExports.map((exportSpecifier) => ({
    exportedName: ModuleContextReader.getAliasOrOwnNameOfImportOrExportSpecifier(exportSpecifier),
    bindingOrigin: OriginTracer.findExportOrigin(
      originLookup,
      scannedTargetPath,
      exportSpecifier.getName(),
    ) ?? {
      kind: ORIGIN_KIND.LOCAL,
      modulePath: scannedTargetPath,
      declarationName: exportSpecifier.getName(),
    },
    isTypeOnly: isTypeOnlyExport(exportDeclaration, exportSpecifier),
  }));
  return { ownExports: [], forwardedExports, needsRewrite: true };
};

// The names the Destination File exports so far, each with the binding and
// the scanned module it was first exported from, and the DUPLICATE_EXPORT
// errors found on the way.
type ExportedNameRegistry = {
  exportByName: Map<string, { originKey: string; modulePath: string }>;
  diagnostics: Diagnostic[];
  baseDirectory: string;
};

// Records `exportedBinding` as exported by module `modulePath`, returning
// whether it is new. The same binding exported again, through a re-export,
// returns false and is dropped; a different binding under the same name is a
// DUPLICATE_EXPORT error.
//
//   // user.ts: export const user = …;
//   // index.ts: export { user } from './user.js';   // same binding: false, dropped
//   // post.ts: export const user = …;               // different: DUPLICATE_EXPORT
const registerExportedName = (
  exportedNameRegistry: ExportedNameRegistry,
  modulePath: string,
  exportedBinding: ExportedBinding,
): boolean => {
  const alreadyExported = exportedNameRegistry.exportByName.get(exportedBinding.exportedName);
  if (alreadyExported === undefined) {
    exportedNameRegistry.exportByName.set(exportedBinding.exportedName, {
      originKey: OriginTracer.toOriginKey(exportedBinding.bindingOrigin),
      modulePath,
    });
    return true;
  }
  if (alreadyExported.originKey !== OriginTracer.toOriginKey(exportedBinding.bindingOrigin)) {
    exportedNameRegistry.diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODE.DUPLICATE_EXPORT,
        message: `\`${exportedBinding.exportedName}\` is also exported by ${toDisplayPath(exportedNameRegistry.baseDirectory, alreadyExported.modulePath)}, and the Destination File can export it only once. Rename one of them.`,
        file: modulePath,
      }),
    );
  }
  return false;
};

export type PlanExportsArgs = {
  /** In emission order. */
  moduleContexts: ReadonlyArray<ModuleContext>;
  originLookup: OriginLookup;
  baseDirectory: string;
};

/**
 * Decides every name the Destination File exports. Every module's own
 * exports are registered first, in emission order, then the re-exports
 * between scanned files, so a re-export of a name the Destination File
 * already exports is dropped instead of exported twice.
 *
 * ```ts
 * // user.ts:  export const user = …;
 * // index.ts: export { user, user as account } from './user.js';
 * // → the Destination File exports `user` once, and `export { user as account };`
 * ```
 *
 * A name exported by two different bindings is reported as DUPLICATE_EXPORT.
 * Plans against the names as written, so it runs before any is renamed.
 */
export const planExports = ({
  moduleContexts,
  originLookup,
  baseDirectory,
}: PlanExportsArgs): PlanExportsPayload => {
  const exportedNameRegistry: ExportedNameRegistry = {
    exportByName: new Map(),
    diagnostics: [],
    baseDirectory,
  };
  const rewriteByDeclaration = new Map<ExportDeclaration, ExportDeclarationRewrite>();
  const forwardsAwaitingRegistration: Array<{
    declarationRewrite: ExportDeclarationRewrite;
    modulePath: string;
    forwardedExport: ForwardedExport;
  }> = [];
  for (const moduleContext of moduleContexts) {
    const { path, sourceFile } = moduleContext.scannedModule;
    readDeclaredExports(originLookup, moduleContext).forEach((exportedBinding) =>
      registerExportedName(exportedNameRegistry, path, exportedBinding),
    );
    for (const exportDeclaration of sourceFile.getExportDeclarations()) {
      const { ownExports, forwardedExports, needsRewrite } = classifyExportDeclaration({
        originLookup,
        moduleContext,
        exportDeclaration,
      });
      ownExports.forEach((exportedBinding) =>
        registerExportedName(exportedNameRegistry, path, exportedBinding),
      );
      if (needsRewrite) {
        const declarationRewrite: ExportDeclarationRewrite = {
          forwardedNames: new Set(forwardedExports.map(({ exportedName }) => exportedName)),
          forwardsToEmit: [],
        };
        rewriteByDeclaration.set(exportDeclaration, declarationRewrite);
        forwardsAwaitingRegistration.push(
          ...forwardedExports.map((forwardedExport) => ({
            declarationRewrite,
            modulePath: path,
            forwardedExport,
          })),
        );
      }
    }
  }
  // After every module's own exports, so a forward is dropped wherever the
  // binding is exported under that name.
  for (const { declarationRewrite, modulePath, forwardedExport } of forwardsAwaitingRegistration) {
    if (registerExportedName(exportedNameRegistry, modulePath, forwardedExport)) {
      declarationRewrite.forwardsToEmit.push(forwardedExport);
    }
  }
  return { diagnostics: exportedNameRegistry.diagnostics, rewriteByDeclaration };
};

// The `type ` keyword to put before a type-only export specifier, or nothing.
//
//   typeKeywordPrefix(true)   // 'type '  → export { type User }
//   typeKeywordPrefix(false)  // ''       → export { user }
const typeKeywordPrefix = (isTypeOnly: boolean): string => {
  return isTypeOnly ? 'type ' : '';
};

// The export specifier text exporting the binding `localName` as `exportedName`.
//
//   formatExportSpecifier('user', 'user')     // 'user'
//   formatExportSpecifier('user', 'account')  // 'user as account'
const formatExportSpecifier = (localName: string, exportedName: string): string => {
  return localName === exportedName ? exportedName : `${localName} as ${exportedName}`;
};

// The statements replacing an export declaration that needs rewriting: one
// `export { … }` with the export specifiers it keeps and each forward into the
// scanned set pointing at its binding's final name, then a separate
// `export … from` for each forward that ends outside the set.
//
//   // user.ts:      const user = …; export { user as account };
//   // reexports.ts: export { pvl } from '@pvl/schema';
//   import { account } from './user.js';
//   import { pvl } from './reexports.js';
//   export { post, account as member, pvl };
//
//   → export { post, user as member };
//     export { pvl } from '@pvl/schema';
//
// where `user` is user.ts's binding under its final name: `user_2` if
// another module claimed `user` first.
//
// Returns nothing when every forward was dropped as already exported.
const renderRewrittenExportStatements = (
  exportDeclaration: ExportDeclaration,
  declarationRewrite: ExportDeclarationRewrite,
  finalNameByOriginKey: ReadonlyMap<string, string>,
): string[] => {
  const keptExportSpecifierTexts = exportDeclaration
    .getNamedExports()
    .filter(
      (exportSpecifier) =>
        !declarationRewrite.forwardedNames.has(
          ModuleContextReader.getAliasOrOwnNameOfImportOrExportSpecifier(exportSpecifier),
        ),
    )
    .map((exportSpecifier) => exportSpecifier.getText());
  const externalReExportStatements: string[] = [];
  for (const { exportedName, bindingOrigin, isTypeOnly } of declarationRewrite.forwardsToEmit) {
    if (bindingOrigin.kind === ORIGIN_KIND.LOCAL) {
      const localName =
        finalNameByOriginKey.get(OriginTracer.toOriginKey(bindingOrigin)) ??
        bindingOrigin.declarationName;
      keptExportSpecifierTexts.push(
        `${typeKeywordPrefix(isTypeOnly)}${formatExportSpecifier(localName, exportedName)}`,
      );
    } else if (bindingOrigin.importedName === '*') {
      externalReExportStatements.push(
        `export * as ${exportedName} from '${bindingOrigin.rewrittenModuleSpecifier}';`,
      );
    } else {
      externalReExportStatements.push(
        `export { ${typeKeywordPrefix(isTypeOnly)}${formatExportSpecifier(bindingOrigin.importedName, exportedName)} } from '${bindingOrigin.rewrittenModuleSpecifier}';`,
      );
    }
  }
  return [
    ...(keptExportSpecifierTexts.length > 0
      ? [`export { ${keptExportSpecifierTexts.join(', ')} };`]
      : []),
    ...externalReExportStatements,
  ];
};

export type RewriteExportsArgs = {
  sourceFile: SourceFile;
  exportPlan: PlanExportsPayload;
  /** Origin key → the name a renamed binding ended up with. */
  finalNameByOriginKey: ReadonlyMap<string, string>;
  outputDirectory: string;
};

/**
 * Rewrites one module's export declarations for the Destination File: each
 * one `exportPlan` rewrites is replaced by its new statements, or removed
 * when none are left, and every other `export … from` keeps its text with
 * its module specifier rewritten to resolve from the output directory.
 *
 * ```ts
 * export { user as account } from './user.js'; // planned: → export { user as account };
 * export * from './user.js';                   // planned: removed
 * export { helper } from '../helpers.js';      // module specifier rewritten for the output directory
 * export { post };                             // unchanged
 * ```
 */
export const rewriteExports = ({
  sourceFile,
  exportPlan,
  finalNameByOriginKey,
  outputDirectory,
}: RewriteExportsArgs): void => {
  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    const plannedRewrite = exportPlan.rewriteByDeclaration.get(exportDeclaration);
    const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();
    if (plannedRewrite !== undefined) {
      const replacementStatements = renderRewrittenExportStatements(
        exportDeclaration,
        plannedRewrite,
        finalNameByOriginKey,
      );
      if (replacementStatements.length === 0) {
        exportDeclaration.remove();
      } else {
        exportDeclaration.replaceWithText(replacementStatements.join('\n'));
      }
    } else if (moduleSpecifier !== undefined) {
      exportDeclaration.setModuleSpecifier(
        rewriteModuleSpecifierForOutputDirectory(
          moduleSpecifier,
          sourceFile.getFilePath(),
          outputDirectory,
        ),
      );
    }
  }
};
