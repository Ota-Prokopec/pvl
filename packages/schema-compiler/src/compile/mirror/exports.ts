// Every name the Destination File exports and the binding behind it. A
// re-export whose binding lives elsewhere forwards to that binding, and is
// dropped when the binding is already exported under the same name.
import { relative } from 'node:path';
import type { ExportDeclaration, SourceFile } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { aliasOrName, type ModuleContext } from './context.js';
import { resolveScanned, rewriteSpecifier, toPosix } from './modules.js';
import { ORIGIN_KIND, originKey, type Origin, type OriginResolver } from './origins.js';

/** One exported name of a re-export whose binding isn't the module's own. */
export type Forward = {
  name: string;
  origin: Origin;
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

export type PlanExportsArgs = {
  /** In emission order. */
  contexts: ReadonlyArray<ModuleContext>;
  resolver: OriginResolver;
  scanned: ReadonlySet<string>;
  baseDirectory: string;
  outputDirectory: string;
};

export const planExports = ({
  contexts,
  resolver,
  scanned,
  baseDirectory,
  outputDirectory,
}: PlanExportsArgs): PlanExportsPayload => {
  const diagnostics: Diagnostic[] = [];
  const exported = new Map<string, { key: string; module: string }>();
  // Whether `name` is newly exported; a different binding already exported
  // under it is a DUPLICATE_EXPORT.
  const register = (name: string, origin: Origin, module: string): boolean => {
    const existing = exported.get(name);
    if (existing === undefined) {
      exported.set(name, { key: originKey(origin), module });
      return true;
    }
    if (existing.key !== originKey(origin)) {
      diagnostics.push(
        createDiagnostic({
          code: DIAGNOSTIC_CODE.DUPLICATE_EXPORT,
          message: `\`${name}\` is also exported by ${toPosix(relative(baseDirectory, existing.module))}, and the Destination File can export it only once. Rename one of them.`,
          file: module,
        }),
      );
    }
    return false;
  };

  const declarations = new Map<ExportDeclaration, DeclarationPlan>();
  const pending: Array<{ plan: DeclarationPlan; module: string; forward: Forward }> = [];
  for (const context of contexts) {
    const { path, sourceFile } = context.module;
    for (const [name, local] of context.declaredExports) {
      register(name, { kind: ORIGIN_KIND.LOCAL, module: path, name: local }, path);
    }
    if (sourceFile.getExportAssignments().some((assignment) => !assignment.isExportEquals())) {
      const local = context.localExports.get('default');
      const origin: Origin =
        local === undefined
          ? { kind: ORIGIN_KIND.LOCAL, module: path, name: 'default' }
          : resolver.resolveLocal(context, local);
      register('default', origin, path);
    }
    for (const declaration of sourceFile.getExportDeclarations()) {
      const raw = declaration.getModuleSpecifierValue();
      if (raw === undefined) {
        // `export { … }`: a name bound in this module stays as written.
        const plan: DeclarationPlan = { forwarded: new Set(), forwards: [] };
        for (const specifierNode of declaration.getNamedExports()) {
          const name = aliasOrName(specifierNode);
          const origin = resolver.resolveLocal(context, specifierNode.getName());
          if (origin.kind === ORIGIN_KIND.LOCAL && origin.module === path) {
            register(name, origin, path);
          } else {
            plan.forwarded.add(name);
            const typeOnly = declaration.isTypeOnly() || specifierNode.isTypeOnly();
            pending.push({ plan, module: path, forward: { name, origin, typeOnly } });
          }
        }
        if (plan.forwarded.size > 0) {
          declarations.set(declaration, plan);
        }
        continue;
      }
      const target = resolveScanned(raw, path, scanned);
      const specifier = rewriteSpecifier(raw, path, outputDirectory);
      const namespaceExport = declaration.getNamespaceExport();
      if (namespaceExport !== undefined) {
        // Like a namespace import, it keeps pointing at the original file.
        register(
          namespaceExport.getName(),
          { kind: ORIGIN_KIND.EXTERNAL, specifier, imported: '*' },
          path,
        );
        continue;
      }
      if (target === undefined) {
        for (const specifierNode of declaration.getNamedExports()) {
          const name = aliasOrName(specifierNode);
          register(
            name,
            { kind: ORIGIN_KIND.EXTERNAL, specifier, imported: specifierNode.getName() },
            path,
          );
        }
        continue;
      }
      // Into the set: `export *` is dropped, as every name it re-exports is
      // already exported by the module that binds it.
      const plan: DeclarationPlan = { forwarded: new Set(), forwards: [] };
      declarations.set(declaration, plan);
      for (const specifierNode of declaration.getNamedExports()) {
        const name = aliasOrName(specifierNode);
        const origin = resolver.resolveExport(target, specifierNode.getName()) ?? {
          kind: ORIGIN_KIND.LOCAL,
          module: target,
          name: specifierNode.getName(),
        };
        plan.forwarded.add(name);
        const typeOnly = declaration.isTypeOnly() || specifierNode.isTypeOnly();
        pending.push({ plan, module: path, forward: { name, origin, typeOnly } });
      }
    }
  }
  // After every module's own exports, so a forward is dropped wherever the
  // binding is exported under that name.
  for (const { plan, module, forward } of pending) {
    if (register(forward.name, forward.origin, module)) {
      plan.forwards.push(forward);
    }
  }
  return { diagnostics, declarations };
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
