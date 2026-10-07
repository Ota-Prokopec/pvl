// Every name the Destination File exports and the binding behind it. A
// re-export whose binding lives elsewhere forwards to that binding, and is
// dropped when the binding is already exported under the same name.
import type { ExportDeclaration, ExportSpecifier, SourceFile } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { aliasOrName, type ModuleContext } from './context.js';
import { resolveScanned } from './tsMorphProject.js';
import { displayPath, rewriteSpecifier } from './utils.js';
import {
  ORIGIN_KIND,
  originKey,
  resolveExport,
  resolveLocal,
  type Origin,
  type OriginLookup,
} from './origins.js';

/** One name a module exports, and the binding behind it. */
export type ExportEntry = {
  name: string;
  origin: Origin;
};

/** One exported name of a re-export whose binding isn't the module's own. */
export type Forward = ExportEntry & {
  typeOnly: boolean;
};

/**
 * How one export declaration is rewritten: `forwarded` holds every name it
 * forwards, `forwards` only those still to be exported from it.
 */
export type DeclarationPlan = {
  forwarded: Set<string>;
  forwards: Forward[];
};

export type PlanExportsPayload = {
  diagnostics: Diagnostic[];
  /** The export declarations to rewrite; any other keeps its text, its specifier rewritten. */
  declarations: Map<ExportDeclaration, DeclarationPlan>;
};

// What one export declaration exports: the names bound where it points,
// registered as they are, and the ones forwarded from elsewhere in the set.
// A `rewritten` declaration is replaced by its forwards.
type DeclarationExports = {
  own: ExportEntry[];
  forwards: Forward[];
  rewritten: boolean;
};

// The names a module exports through `export` on a declaration and
// `export default`.
const declaredExportEntries = (lookup: OriginLookup, context: ModuleContext): ExportEntry[] => {
  const { path, sourceFile } = context.module;
  const entries: ExportEntry[] = [...context.declaredExports].map(([name, local]) => ({
    name,
    origin: { kind: ORIGIN_KIND.LOCAL, module: path, name: local },
  }));
  if (sourceFile.getExportAssignments().some((assignment) => !assignment.isExportEquals())) {
    const local = context.localExports.get('default');
    const origin: Origin =
      local === undefined
        ? { kind: ORIGIN_KIND.LOCAL, module: path, name: 'default' }
        : resolveLocal(lookup, context, local);
    entries.push({ name: 'default', origin });
  }
  return entries;
};

const isTypeOnlyExport = (
  declaration: ExportDeclaration,
  specifierNode: ExportSpecifier,
): boolean => {
  return declaration.isTypeOnly() || specifierNode.isTypeOnly();
};

const isOwnEntry = ({ origin }: ExportEntry, path: string): boolean => {
  return origin.kind === ORIGIN_KIND.LOCAL && origin.module === path;
};

type ReadDeclarationExportsArgs = {
  lookup: OriginLookup;
  context: ModuleContext;
  declaration: ExportDeclaration;
};

const readDeclarationExports = ({
  lookup,
  context,
  declaration,
}: ReadDeclarationExportsArgs): DeclarationExports => {
  const { path } = context.module;
  const raw = declaration.getModuleSpecifierValue();
  const named = declaration.getNamedExports();
  if (raw === undefined) {
    // `export { … }`: a name bound in this module stays as written.
    const entries = named.map((specifierNode) => ({
      name: aliasOrName(specifierNode),
      origin: resolveLocal(lookup, context, specifierNode.getName()),
      typeOnly: isTypeOnlyExport(declaration, specifierNode),
    }));
    const forwards = entries.filter((entry) => !isOwnEntry(entry, path));
    const own = entries.filter((entry) => isOwnEntry(entry, path));
    return { own, forwards, rewritten: forwards.length > 0 };
  }
  const target = resolveScanned(raw, path, lookup.scanned);
  const specifier = rewriteSpecifier(raw, path, lookup.outputDirectory);
  const namespaceExport = declaration.getNamespaceExport();
  if (namespaceExport !== undefined) {
    const origin: Origin = { kind: ORIGIN_KIND.EXTERNAL, specifier, imported: '*' };
    return { own: [{ name: namespaceExport.getName(), origin }], forwards: [], rewritten: false };
  }
  if (target === undefined) {
    const own = named.map((specifierNode) => ({
      name: aliasOrName(specifierNode),
      origin: {
        kind: ORIGIN_KIND.EXTERNAL,
        specifier,
        imported: specifierNode.getName(),
      } satisfies Origin,
    }));
    return { own, forwards: [], rewritten: false };
  }
  // Into the set: `export *` is dropped, as every name it re-exports is
  // already exported by the module that binds it.
  const forwards = named.map((specifierNode) => ({
    name: aliasOrName(specifierNode),
    origin: resolveExport(lookup, target, specifierNode.getName()) ?? {
      kind: ORIGIN_KIND.LOCAL,
      module: target,
      name: specifierNode.getName(),
    },
    typeOnly: isTypeOnlyExport(declaration, specifierNode),
  }));
  return { own: [], forwards, rewritten: true };
};

// Every name exported so far, with the binding and module behind it.
type ExportRegistry = {
  exported: Map<string, { key: string; module: string }>;
  diagnostics: Diagnostic[];
  baseDirectory: string;
};

// Whether `entry` is newly exported; a different binding already exported
// under its name is a DUPLICATE_EXPORT.
const register = (registry: ExportRegistry, module: string, entry: ExportEntry): boolean => {
  const existing = registry.exported.get(entry.name);
  if (existing === undefined) {
    registry.exported.set(entry.name, { key: originKey(entry.origin), module });
    return true;
  }
  if (existing.key !== originKey(entry.origin)) {
    registry.diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODE.DUPLICATE_EXPORT,
        message: `\`${entry.name}\` is also exported by ${displayPath(registry.baseDirectory, existing.module)}, and the Destination File can export it only once. Rename one of them.`,
        file: module,
      }),
    );
  }
  return false;
};

export type PlanExportsArgs = {
  /** In emission order. */
  contexts: ReadonlyArray<ModuleContext>;
  lookup: OriginLookup;
  baseDirectory: string;
};

export const planExports = ({
  contexts,
  lookup,
  baseDirectory,
}: PlanExportsArgs): PlanExportsPayload => {
  const registry: ExportRegistry = { exported: new Map(), diagnostics: [], baseDirectory };
  const declarations = new Map<ExportDeclaration, DeclarationPlan>();
  const pending: Array<{ plan: DeclarationPlan; module: string; forward: Forward }> = [];
  for (const context of contexts) {
    const { path, sourceFile } = context.module;
    declaredExportEntries(lookup, context).forEach((entry) => register(registry, path, entry));
    for (const declaration of sourceFile.getExportDeclarations()) {
      const { own, forwards, rewritten } = readDeclarationExports({ lookup, context, declaration });
      own.forEach((entry) => register(registry, path, entry));
      if (rewritten) {
        const plan: DeclarationPlan = {
          forwarded: new Set(forwards.map(({ name }) => name)),
          forwards: [],
        };
        declarations.set(declaration, plan);
        pending.push(...forwards.map((forward) => ({ plan, module: path, forward })));
      }
    }
  }
  // After every module's own exports, so a forward is dropped wherever the
  // binding is exported under that name.
  for (const { plan, module, forward } of pending) {
    if (register(registry, module, forward)) {
      plan.forwards.push(forward);
    }
  }
  return { diagnostics: registry.diagnostics, declarations };
};

const typePrefix = (typeOnly: boolean): string => {
  return typeOnly ? 'type ' : '';
};

const aliased = (local: string, name: string): string => {
  return local === name ? name : `${local} as ${name}`;
};

// The statements replacing a planned declaration: the specifiers it keeps,
// then each forward pointing at its binding's final name.
const forwardedText = (
  declaration: ExportDeclaration,
  plan: DeclarationPlan,
  finalNames: ReadonlyMap<string, string>,
): string[] => {
  const named = declaration
    .getNamedExports()
    .filter((specifierNode) => !plan.forwarded.has(aliasOrName(specifierNode)))
    .map((specifierNode) => specifierNode.getText());
  const fromOutside: string[] = [];
  for (const { name, origin, typeOnly } of plan.forwards) {
    if (origin.kind === ORIGIN_KIND.LOCAL) {
      const local = finalNames.get(originKey(origin)) ?? origin.name;
      named.push(`${typePrefix(typeOnly)}${aliased(local, name)}`);
    } else if (origin.imported === '*') {
      fromOutside.push(`export * as ${name} from '${origin.specifier}';`);
    } else {
      fromOutside.push(
        `export { ${typePrefix(typeOnly)}${aliased(origin.imported, name)} } from '${origin.specifier}';`,
      );
    }
  }
  return [...(named.length > 0 ? [`export { ${named.join(', ')} };`] : []), ...fromOutside];
};

export type RewriteExportsArgs = {
  sourceFile: SourceFile;
  plan: PlanExportsPayload;
  /** Origin key → the name a renamed binding ended up with. */
  finalNames: ReadonlyMap<string, string>;
  outputDirectory: string;
};

/** Applies `plan` to one module's export declarations, and rewrites every other one's specifier. */
export const rewriteExports = ({
  sourceFile,
  plan,
  finalNames,
  outputDirectory,
}: RewriteExportsArgs): void => {
  for (const declaration of sourceFile.getExportDeclarations()) {
    const planned = plan.declarations.get(declaration);
    const raw = declaration.getModuleSpecifierValue();
    if (planned !== undefined) {
      const text = forwardedText(declaration, planned, finalNames);
      if (text.length === 0) {
        declaration.remove();
      } else {
        declaration.replaceWithText(text.join('\n'));
      }
    } else if (raw !== undefined) {
      declaration.setModuleSpecifier(
        rewriteSpecifier(raw, sourceFile.getFilePath(), outputDirectory),
      );
    }
  }
};
