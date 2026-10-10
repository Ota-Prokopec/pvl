// One scanned file as the mirror sees it: its parsed source, where it lands
// in the Destination Directory, what the mirror asks of it, and compiling it
// into its mirrored file.
import * as path from 'node:path';
import { Node, type Project, type SourceFile } from 'ts-morph';
import { GENERATED_HEADER } from '../../consts.js';
import type { Destination } from '../../destination/destination.js';
import type {
  MarkedToCompileSchemaSite,
  ScannedModuleCompiler,
} from '../generate/scannedModuleCompiler.js';
import { Path } from '../path.js';
import type { ScannedPath } from '../scan.js';
import { ModuleSpecifiers } from './moduleSpecifiers.js';

/**
 * The absolute path of a scanned file's mirrored module. Branded so it can't
 * be mixed up with the scanned file's own path: `Module.readAll` is the only
 * place one is made.
 */
export type MirroredPath = string & { readonly __brand: 'MirroredPath' };

/** A scanned file's location, and the source file and mirrored location a `Module` holds for it. */
export type ModuleOptions = {
  /** The file's location, relative to the Root Directory. */
  scannedPath: Required<Path>;
  /** Its ts-morph source file. */
  sourceFile: SourceFile;
  /** The absolute path of its mirrored module. */
  mirroredPath: MirroredPath;
};

/** One file the Destination Directory holds. */
export type MirroredFile = {
  /** Its path relative to the Destination Directory, with `/` separators. */
  relativePath: string;
  text: string;
};

export type CompileModuleArgs = {
  tsMorphProject: Project;
  /** The module's compiler, which read its `pvl.compile(...)` calls. */
  scannedModuleCompiler: ScannedModuleCompiler;
  /** The module's `pvl.compile(...)` calls that compile. */
  sites: ReadonlyArray<MarkedToCompileSchemaSite>;
  /** Lets an import of another scanned file point at that file's mirror instead. */
  mirroredPathByScannedPath: ReadonlyMap<ScannedPath, MirroredPath>;
};

export type ReadAllModulesArgs = {
  tsMorphProject: Project;
  /** The scanned files' absolute paths. */
  scannedFilePaths: ReadonlyArray<ScannedPath>;
  /** The Root Directory's absolute path. */
  rootDirectory: string;
  destination: Destination;
};

/**
 * One scanned file. Its `relative.path` is relative to the Root Directory,
 * which is also its path inside the Destination Directory.
 *
 * ```ts
 * const [user] = Module.readAll({ …, scannedFilePaths: ['/repo/src/schemas/user.ts'] });
 * user.relative.path // 'schemas/user.ts'
 * user.mirroredPath  // '/repo/.pvl/schemas/user.ts'
 * ```
 */
export class Module extends Path {
  /** The file's absolute path. */
  declare public readonly absolutePath: ScannedPath;
  /** Its path relative to the Root Directory. */
  declare public readonly relative: NonNullable<Path['relative']>;
  /** Its ts-morph source file, which the mirror reads and rewrites in place. */
  public readonly sourceFile: SourceFile;
  /** The absolute path of its mirrored module. */
  public readonly mirroredPath: MirroredPath;

  /** A `Module` of the scanned file at `scannedPath`; `Module.readAll` makes them. */
  protected constructor({ scannedPath, sourceFile, mirroredPath }: ModuleOptions) {
    super(scannedPath.absolutePath, scannedPath.relative);
    this.sourceFile = sourceFile;
    this.mirroredPath = mirroredPath;
  }

  /**
   * Adds each scanned file to `tsMorphProject` and places it in the mirror,
   * keeping the order of `scannedFilePaths`. A file outside the Root Directory
   * gets a `relative.path` starting with `..` (or an absolute one, on another
   * drive), which FILE_OUTSIDE_ROOT_DIR reports.
   *
   * With Root Directory `/repo/src` and Destination Directory `/repo/.pvl`:
   *
   * ```ts
   * Module.readAll({ …, scannedFilePaths: ['/repo/src/schemas/user.ts'] })
   * // [Module { absolutePath: '/repo/src/schemas/user.ts',
   * //    relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' },
   * //    sourceFile: <user.ts>, mirroredPath: '/repo/.pvl/schemas/user.ts' }]
   * ```
   *
   * Throws ts-morph's error when a path can't be read from disk.
   */
  public static readAll({
    tsMorphProject,
    scannedFilePaths,
    rootDirectory,
    destination,
  }: ReadAllModulesArgs): Module[] {
    return scannedFilePaths.map((scannedFilePath) => {
      const scannedPath = Path.create(scannedFilePath, rootDirectory);
      return new Module({
        scannedPath,
        sourceFile: tsMorphProject.addSourceFileAtPath(scannedFilePath),
        mirroredPath: path.join(
          destination.absolutePath,
          scannedPath.relative.path,
        ) as MirroredPath,
      });
    });
  }

  /**
   * Whether the module's `relative.path`, relative to the Root Directory,
   * leads outside it, so the module has no place in the mirror.
   *
   * ```ts
   * // relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' }
   * module.isOutsideRootDirectory() // false
   * // relative: { absoluteBase: '/repo/src', path: '../lib/user.ts' }
   * module.isOutsideRootDirectory() // true
   * ```
   */
  public isOutsideRootDirectory(): boolean {
    const relativePath = this.relative.path;
    return relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath);
  }

  /**
   * Turns the module into its mirrored file by editing its source file in
   * place: replaces its `pvl.compile(...)` calls with straight-line code,
   * points its module specifiers at the right files from the mirrored
   * location, then prepends the `@generated` header.
   *
   * ```ts
   * // /repo/src/schemas/user.ts, mirrored to /repo/.pvl/schemas/user.ts
   * import { pvl } from '@pvl/schema';
   * import { tags } from '../lib/tags.js';
   * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
   * // module.compile({ … })
   * // → { relativePath: 'schemas/user.ts', text: '<@generated header>\n…' }, where
   * //   '../lib/tags.js' becomes '../../src/lib/tags.js' and `pvl.compile(...)`
   * //   becomes an instance of its emitted Compiled Schema class
   * ```
   */
  public compile({
    tsMorphProject,
    scannedModuleCompiler,
    sites,
    mirroredPathByScannedPath,
  }: CompileModuleArgs): MirroredFile {
    scannedModuleCompiler.applyCompiledSchemas(sites);

    new ModuleSpecifiers({
      tsMorphProject,
      scannedModule: this,
      mirroredPathByScannedPath,
    }).rewriteModuleSpecifiers();

    return {
      relativePath: this.relative.path,
      text: `${GENERATED_HEADER}\n${this.sourceFile.getFullText()}`,
    };
  }

  /**
   * Whether any of the module's top-level statements exports a name, in any
   * form:
   *
   * ```ts
   * export const user = …;        export { user };
   * export * from './user.js';    export type User = …;
   * ```
   *
   * A file of only `const internal = 1;` exports nothing.
   */
  public hasExport(): boolean {
    return this.sourceFile
      .getStatements()
      .some(
        (statement) =>
          Node.isExportDeclaration(statement) ||
          Node.isExportAssignment(statement) ||
          (Node.isExportable(statement) && statement.hasExportKeyword()),
      );
  }
}
