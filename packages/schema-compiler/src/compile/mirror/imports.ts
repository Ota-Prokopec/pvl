// The Destination File's import block: every import from outside the set,
// hoisted and merged into one declaration per specifier and binding kind,
// sorted so the same input always prints the same block.
import type { ImportBinding } from './context.js';

const byLocal = (a: ImportBinding, b: ImportBinding): number => {
  return a.local < b.local ? -1 : 1;
};

const namedImport = (allTypes: boolean) => {
  return ({ imported, local, typeOnly }: ImportBinding): string => {
    const name = imported === local ? local : `${imported} as ${local}`;
    return typeOnly && !allTypes ? `type ${name}` : name;
  };
};

export type RenderImportsArgs = {
  bindings: ReadonlyArray<ImportBinding>;
  /** Specifiers imported for their side effect only. */
  bareImports: ReadonlyArray<string>;
};

export const renderImports = ({ bindings, bareImports }: RenderImportsArgs): string => {
  // The same binding imported by several modules is one import, type-only
  // only when every module imported it as a type.
  const merged = new Map<string, ImportBinding>();
  for (const binding of bindings) {
    const key = `${binding.specifier}\0${binding.imported}\0${binding.local}`;
    const typeOnly = binding.typeOnly && (merged.get(key)?.typeOnly ?? true);
    merged.set(key, { ...binding, typeOnly });
  }
  const bySpecifier = new Map<string, ImportBinding[]>(
    bareImports.map((specifier) => [specifier, []]),
  );
  for (const binding of merged.values()) {
    bySpecifier.set(binding.specifier, [...(bySpecifier.get(binding.specifier) ?? []), binding]);
  }

  const lines: string[] = [];
  for (const specifier of [...bySpecifier.keys()].sort()) {
    const group = [...(bySpecifier.get(specifier) ?? [])].sort(byLocal);
    const from = `from '${specifier}';`;
    if (group.length === 0) {
      lines.push(`import '${specifier}';`);
    }
    for (const { local, typeOnly } of group.filter(({ imported }) => imported === 'default')) {
      lines.push(`import ${typeOnly ? 'type ' : ''}${local} ${from}`);
    }
    for (const { local, typeOnly } of group.filter(({ imported }) => imported === '*')) {
      lines.push(`import ${typeOnly ? 'type ' : ''}* as ${local} ${from}`);
    }
    const named = group.filter(({ imported }) => imported !== 'default' && imported !== '*');
    if (named.length > 0) {
      const allTypes = named.every(({ typeOnly }) => typeOnly);
      const names = named.map(namedImport(allTypes)).join(', ');
      lines.push(`import ${allTypes ? 'type ' : ''}{ ${names} } ${from}`);
    }
  }
  return lines.join('\n');
};
