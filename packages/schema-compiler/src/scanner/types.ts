// What a scan covers and what it finds: the scope `runCompilation` passes to
// `Scanner.scan`, the branded path of each file it finds, and what it returns.
import type { Destination } from '../destination/destination.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';

/**
 * The absolute path of a scanned file. Branded so it can't be mixed up with
 * any other path, such as a mirrored module's or one a module specifier
 * resolves to: `Scanner.scan` is the only place one is made.
 */
export type ScannedPath = string & { readonly __brand: 'ScannedPath' };

/**
 * What a run scans, and the Destination Directory it must never scan.
 * `runCompilation` builds it from the resolved settings and passes it to
 * `Scanner.scan`.
 *
 * ```ts
 * { baseDirectory: '/repo', include: ['src/**\/*.ts'], destination: { absolutePath: '/repo/.pvl', … } }
 * ```
 */
export type ScanScope = {
  /** The directory `include` patterns resolve against: the config file's directory, or `cwd` without one. */
  baseDirectory: string;
  /** The config's `include` globs, relative to `baseDirectory`. */
  include: ReadonlyArray<string>;
  /** The Destination Directory, which is never scanned. */
  destination: Destination;
};

/** What `Scanner.scan` returns: the files `include` matched, and what `include` raises. */
export type ScanPayload = {
  /** The matched files' absolute paths, sorted and without duplicates. */
  scannedFilePaths: ScannedPath[];
  /** DESTINATION_INSIDE_INCLUDE for each pattern matching the destination, SYMLINK_SKIPPED for each symlink matched, then NO_INPUT_FILES when no file matched. */
  diagnostics: Diagnostic[];
};
