// Every name the Destination File exports and the binding behind it. A
// re-export whose binding lives elsewhere forwards to that binding, and is
// dropped when the binding is already exported under the same name.
import type { ExportDeclaration, ExportSpecifier, SourceFile } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { getAliasOrOwnName, type ModuleContext } from './context.js';
import { resolveToScannedFile } from './tsMorphProject.js';
import { toDisplayPath, rewriteSpecifierForOutputDirectory } from './utils.js';
import {
  ORIGIN_KIND,
  toOriginKey,
  findExportOrigin,
  findLocalNameOrigin,
  type Origin,
  type OriginLookup,
} from './origins.js';

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
  /** The export declarations to rewrite; any other keeps its text, its specifier rewritten. */
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

// The names a module exports through `export` on a declaration and
// `export default`.
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
    const localName = moduleContext.localNameByExportedName.get('default');
    const bindingOrigin: Origin =
      localName === undefined
        ? { kind: ORIGIN_KIND.LOCAL, modulePath: path, declarationName: 'default' }
        : findLocalNameOrigin(originLookup, moduleContext, localName);
    exportedBindings.push({ exportedName: 'default', bindingOrigin });
  }
  return exportedBindings;
};

// Whether an exported name is type-only, through `export type { … }` or `export { type … }`.
const isTypeOnlyExport = (
  exportDeclaration: ExportDeclaration,
  exportSpecifier: ExportSpecifier,
): boolean => {
  return exportDeclaration.isTypeOnly() || exportSpecifier.isTypeOnly();
};

// Whether the binding behind `exportedBinding` is a declaration of module `path` itself.
const isBoundInModule = ({ bindingOrigin }: ExportedBinding, path: string): boolean => {
  return bindingOrigin.kind === ORIGIN_KIND.LOCAL && bindingOrigin.modulePath === path;
};

type ClassifyExportDeclarationArgs = {
  originLookup: OriginLookup;
  moduleContext: ModuleContext;
  exportDeclaration: ExportDeclaration;
};

// Sorts the names one export declaration exports into the module's own
// exports and the ones it forwards from elsewhere in the scanned set.
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
      exportedName: getAliasOrOwnName(exportSpecifier),
      bindingOrigin: findLocalNameOrigin(originLookup, moduleContext, exportSpecifier.getName()),
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
  const scannedTargetPath = resolveToScannedFile(
    moduleSpecifier,
    path,
    originLookup.scannedFilePaths,
  );
  const rewrittenSpecifier = rewriteSpecifierForOutputDirectory(
    moduleSpecifier,
    path,
    originLookup.outputDirectory,
  );
  const namespaceExportNode = exportDeclaration.getNamespaceExport();
  if (namespaceExportNode !== undefined) {
    const bindingOrigin: Origin = {
      kind: ORIGIN_KIND.EXTERNAL,
      rewrittenSpecifier,
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
      exportedName: getAliasOrOwnName(exportSpecifier),
      bindingOrigin: {
        kind: ORIGIN_KIND.EXTERNAL,
        rewrittenSpecifier,
        importedName: exportSpecifier.getName(),
      } satisfies Origin,
    }));
    return { ownExports, forwardedExports: [], needsRewrite: false };
  }
  // Into the set: `export *` is dropped, as every name it re-exports is
  // already exported by the module that binds it.
  const forwardedExports = namedExports.map((exportSpecifier) => ({
    exportedName: getAliasOrOwnName(exportSpecifier),
    bindingOrigin: findExportOrigin(originLookup, scannedTargetPath, exportSpecifier.getName()) ?? {
      kind: ORIGIN_KIND.LOCAL,
      modulePath: scannedTargetPath,
      declarationName: exportSpecifier.getName(),
    },
    isTypeOnly: isTypeOnlyExport(exportDeclaration, exportSpecifier),
  }));
  return { ownExports: [], forwardedExports, needsRewrite: true };
};

// Every name exported so far, with the binding and module behind it.
type ExportedNameRegistry = {
  exportByName: Map<string, { originKey: string; modulePath: string }>;
  diagnostics: Diagnostic[];
  baseDirectory: string;
};

// Whether `exportedBinding` is newly exported; a different binding already exported
// under its name is a DUPLICATE_EXPORT.
const registerExportedName = (
  exportedNameRegistry: ExportedNameRegistry,
  modulePath: string,
  exportedBinding: ExportedBinding,
): boolean => {
  const alreadyExported = exportedNameRegistry.exportByName.get(exportedBinding.exportedName);
  if (alreadyExported === undefined) {
    exportedNameRegistry.exportByName.set(exportedBinding.exportedName, {
      originKey: toOriginKey(exportedBinding.bindingOrigin),
      modulePath,
    });
    return true;
  }
  if (alreadyExported.originKey !== toOriginKey(exportedBinding.bindingOrigin)) {
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
 * Decides every name the Destination File exports, module by module in
 * emission order, and reports a DUPLICATE_EXPORT for a name two different
 * bindings are exported under.
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

// `type ` for a type-only export specifier, nothing otherwise.
const typeKeywordPrefix = (isTypeOnly: boolean): string => {
  return isTypeOnly ? 'type ' : '';
};

// An export specifier exporting `localName` as `exportedName`: `a` or `a as b`.
const formatExportSpecifier = (localName: string, exportedName: string): string => {
  return localName === exportedName ? exportedName : `${localName} as ${exportedName}`;
};

// The statements replacing a planned declaration: the specifiers it keeps,
// then each forward pointing at its binding's final name.
const renderRewrittenExportStatements = (
  exportDeclaration: ExportDeclaration,
  declarationRewrite: ExportDeclarationRewrite,
  finalNameByOriginKey: ReadonlyMap<string, string>,
): string[] => {
  const keptSpecifierTexts = exportDeclaration
    .getNamedExports()
    .filter(
      (exportSpecifier) =>
        !declarationRewrite.forwardedNames.has(getAliasOrOwnName(exportSpecifier)),
    )
    .map((exportSpecifier) => exportSpecifier.getText());
  const externalReExportStatements: string[] = [];
  for (const { exportedName, bindingOrigin, isTypeOnly } of declarationRewrite.forwardsToEmit) {
    if (bindingOrigin.kind === ORIGIN_KIND.LOCAL) {
      const localName =
        finalNameByOriginKey.get(toOriginKey(bindingOrigin)) ?? bindingOrigin.declarationName;
      keptSpecifierTexts.push(
        `${typeKeywordPrefix(isTypeOnly)}${formatExportSpecifier(localName, exportedName)}`,
      );
    } else if (bindingOrigin.importedName === '*') {
      externalReExportStatements.push(
        `export * as ${exportedName} from '${bindingOrigin.rewrittenSpecifier}';`,
      );
    } else {
      externalReExportStatements.push(
        `export { ${typeKeywordPrefix(isTypeOnly)}${formatExportSpecifier(bindingOrigin.importedName, exportedName)} } from '${bindingOrigin.rewrittenSpecifier}';`,
      );
    }
  }
  return [
    ...(keptSpecifierTexts.length > 0 ? [`export { ${keptSpecifierTexts.join(', ')} };`] : []),
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

/** Applies `exportPlan` to one module's export declarations, and rewrites every other one's specifier. */
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
        rewriteSpecifierForOutputDirectory(
          moduleSpecifier,
          sourceFile.getFilePath(),
          outputDirectory,
        ),
      );
    }
  }
};
