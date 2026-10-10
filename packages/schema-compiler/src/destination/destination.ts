// Where the Destination Directory and the sibling directories a run keeps
// beside it go. Pure: touches no file.
import { Path } from '../path.js';
import { BACKUP_DESTINATION_SUFFIX, TEMPORARY_DESTINATION_SUFFIX } from '../consts.js';

/**
 * Where the Destination Directory of one compilation run goes. Its
 * `relative.path` is relative to the base directory, the form `include`
 * patterns match against. It also says where the temporary and old
 * directories a run keeps beside it go, so the scanner can skip them and
 * `DestinationWriter` can swap them in.
 *
 * ```ts
 * const destination = Destination.resolveDestination(baseDirectory, settings);
 * destination.getTemporaryDestination().absolutePath; // '/repo/.pvl.pvl-tmp'
 * destination.getOldDestination().absolutePath;       // '/repo/.pvl.pvl-old'
 * ```
 */
export class Destination extends Path {
  /** Its path relative to the base directory. */
  declare public readonly relative: NonNullable<Path['relative']>;
  /** Whether `destination` was unset, so the default `.pvl` directory is used. */
  public readonly isDefault: boolean;

  /** A `Destination` of `path`; `Destination.resolveDestination` makes one. */
  private constructor({ absolutePath, relative }: Required<Path>, isDefault: boolean) {
    super(absolutePath, relative);
    this.isDefault = isDefault;
  }

  /**
   * The sibling directory a run writes the new Destination Directory into
   * before it moves into place, against the same base directory.
   *
   * ```ts
   * // destination.absolutePath '/repo/.pvl'
   * destination.getTemporaryDestination()
   * // { absolutePath: '/repo/.pvl.pvl-tmp', relative: { absoluteBase: '/repo', path: '.pvl.pvl-tmp' }, isDefault: true }
   * ```
   */
  public getTemporaryDestination(): Destination {
    return this.toSiblingDestination(TEMPORARY_DESTINATION_SUFFIX);
  }

  /**
   * The sibling directory the previous Destination Directory waits in until
   * the new one is in place, against the same base directory.
   *
   * ```ts
   * // destination.absolutePath '/repo/.pvl'
   * destination.getOldDestination()
   * // { absolutePath: '/repo/.pvl.pvl-old', relative: { absoluteBase: '/repo', path: '.pvl.pvl-old' }, isDefault: true }
   * ```
   */
  public getOldDestination(): Destination {
    return this.toSiblingDestination(BACKUP_DESTINATION_SUFFIX);
  }

  // This Destination with `suffix` appended to its name, in the same parent
  // and against the same base directory.
  private toSiblingDestination(suffix: string): Destination {
    return new Destination(
      Path.create(`${this.absolutePath}${suffix}`, this.relative.absoluteBase),
      this.isDefault,
    );
  }
}
