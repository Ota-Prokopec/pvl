/**
 * The `@repo/conventions` ESLint plugin: the repo's conventions as rules.
 * `@repo/eslint-config` decides which files each rule runs on.
 */
import type { CompatiblePlugin } from 'typescript-eslint';
import { argsTypeAboveFunction } from './rules/argsTypeAboveFunction.ts';
import { barrelExportsOnly } from './rules/barrelExportsOnly.ts';
import { constantShape } from './rules/constantShape.ts';
import { entryHasAgentsMd } from './rules/entryHasAgentsMd.ts';
import { enumShape } from './rules/enumShape.ts';
import { envFileNames } from './rules/envFileNames.ts';
import { noImportAlias } from './rules/noImportAlias.ts';
import { noInlineEnumValue } from './rules/noInlineEnumValue.ts';
import { noInterface } from './rules/noInterface.ts';
import { noJavascriptFiles } from './rules/noJavascriptFiles.ts';
import { noLocalFunctions } from './rules/noLocalFunctions.ts';
import { noRegex } from './rules/noRegex.ts';
import { noSourceLayoutHeading } from './rules/noSourceLayoutHeading.ts';
import { packageJsonModuleType } from './rules/packageJsonModuleType.ts';
import { packageJsonScripts } from './rules/packageJsonScripts.ts';
import { tsconfigExtends } from './rules/tsconfigExtends.ts';

const plugin = {
  meta: { name: '@repo/conventions' },
  rules: {
    'args-type-above-function': argsTypeAboveFunction,
    'barrel-exports-only': barrelExportsOnly,
    'constant-shape': constantShape,
    'entry-has-agents-md': entryHasAgentsMd,
    'enum-shape': enumShape,
    'env-file-names': envFileNames,
    'no-import-alias': noImportAlias,
    'no-inline-enum-value': noInlineEnumValue,
    'no-interface': noInterface,
    'no-javascript-files': noJavascriptFiles,
    'no-local-functions': noLocalFunctions,
    'no-regex': noRegex,
    'no-source-layout-heading': noSourceLayoutHeading,
    'package-json-module-type': packageJsonModuleType,
    'package-json-scripts': packageJsonScripts,
    'tsconfig-extends': tsconfigExtends,
  },
};

// typescript-eslint's rule types and ESLint's own config types don't line up,
// so the plugin is exported under the same opaque type typescript-eslint
// gives its own plugin, which every ESLint config type accepts.
export const conventionsPlugin: CompatiblePlugin = plugin;
