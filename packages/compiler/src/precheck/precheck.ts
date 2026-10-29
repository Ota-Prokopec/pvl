// What stops a scanned file from being mirrored, and what is worth a warning
// when it is, read from each scanned module as a whole before anything is
// rewritten; each check is one of `./utils.ts`. The errors of its
// `pvl.compile(...)` calls are `findMarkedToCompileSchemas`'s.
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import type { Module } from '../module/module.js';
import {
  findDefaultExportDiagnostics,
  findExportsNothingDiagnostics,
  findOutsideRootDirectoryDiagnostics,
  findParseFailureDiagnostics,
  findSideEffectDiagnostics,
} from './utils.js';

export type PrecheckModulesArgs = {
  /** Every scanned module, in scan order. */
  modules: ReadonlyArray<Module>;
};

export class Precheck {
  /**
   * Every error and warning the scanned modules raise, collected before any
   * source file is touched so one run reports all the problems instead of
   * stopping at the first.
   *
   * ```ts
   * // user.ts parses, broken.ts doesn't
   * Precheck.precheckModules({ modules: [<user.ts>, <broken.ts>] })
   * // […user.ts's diagnostics, PARSE_FAILED (broken.ts)]
   * ```
   */
  public static precheckModules({ modules }: PrecheckModulesArgs): Diagnostic[] {
    return modules.flatMap((module) => Precheck.precheckModule(module));
  }

  /**
   * Every error and warning `module` raises.
   *
   * A module that doesn't parse gets only its parse failure, and its
   * FILE_OUTSIDE_ROOT_DIR when it applies: the tree TypeScript recovers from
   * broken code holds statements nobody wrote, so every later check needs
   * the module to parse.
   *
   * ```ts
   * // /repo/src/schemas/user.ts
   * import { pvl } from '@pcvl/schema';
   * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
   * Precheck.precheckModule(<user.ts>) // []
   *
   * // /repo/src/schemas/broken.ts
   * export const user = pvl.object({ name: pvl.string() ;
   * Precheck.precheckModule(<broken.ts>) // [PARSE_FAILED]
   * ```
   */
  private static precheckModule(module: Module): Diagnostic[] {
    const parseFailureDiagnostics = findParseFailureDiagnostics(module);
    const outsideRootDirectoryDiagnostics = findOutsideRootDirectoryDiagnostics(module);
    if (parseFailureDiagnostics.length > 0) {
      return [...parseFailureDiagnostics, ...outsideRootDirectoryDiagnostics];
    }

    return [
      ...outsideRootDirectoryDiagnostics,
      ...findDefaultExportDiagnostics(module),
      ...findExportsNothingDiagnostics(module),
      ...findSideEffectDiagnostics(module),
    ];
  }
}
