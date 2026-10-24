// Where the Destination Directory and the sibling directories a run keeps
// beside it go. Pure: touches no file.
import * as path from 'node:path';
import type { PvlConfig } from '../config/config.js';
import { createAbsolutePathWithRelative, type AbsolutePathWithRelative } from '../path.js';
import { DEFAULT_DESTINATION_DIRECTORY } from '../config/defaults/consts.js';
import { BACKUP_DESTINATION_SUFFIX, TEMPORARY_DESTINATION_SUFFIX } from '../consts.js';

/**
 * Where the Destination Directory of one compilation run goes. Its
 * `relativePath.pathFromBase` is relative to the base directory, the form `include`
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
export class Destination implements AbsolutePathWithRelative {
  /** Its absolute path. */
  public readonly absolutePath: string;
  /** Its path relative to the base directory. */
  public readonly relativePath: AbsolutePathWithRelative['relativePath'];
  /** Whether `destination` was unset, so the default `.pvl` directory is used. */
  public readonly isDefault: boolean;

  /** A `Destination` at `absolutePath`; `Destination.resolveDestination` makes one. */
  private constructor(
    { absolutePath, relativePath }: AbsolutePathWithRelative,
    isDefault: boolean,
  ) {
    this.absolutePath = absolutePath;
    this.relativePath = relativePath;
    this.isDefault = isDefault;
  }

  /**
   * The Destination Directory `config.destination` names, resolved against
   * `baseDirectory`, or the default `.pvl` directory there when it is unset.
   *
   * ```ts
   * Destination.resolveDestination('/repo', { destination: undefined, … })
   * // { absolutePath: '/repo/.pvl', relativePath: { absoluteBase: '/repo', pathFromBase: '.pvl' }, isDefault: true }
   * Destination.resolveDestination('/repo', { destination: './out/../generated', … })
   * // { absolutePath: '/repo/generated', relativePath: { absoluteBase: '/repo', pathFromBase: 'generated' }, isDefault: false }
   * ```
   */
  public static resolveDestination(
    baseDirectory: string,
    config: Pick<PvlConfig, 'destination'>,
  ): Destination {
    return new Destination(
      createAbsolutePathWithRelative(
        path.resolve(baseDirectory, config.destination ?? DEFAULT_DESTINATION_DIRECTORY),
        baseDirectory,
      ),
      config.destination === undefined,
    );
  }

  /**
   * The sibling directory a run writes the new Destination Directory into
   * before it moves into place, against the same base directory.
   *
   * ```ts
   * // destination.absolutePath '/repo/.pvl'
   * destination.getTemporaryDestination()
   * // { absolutePath: '/repo/.pvl.pvl-tmp', relativePath: { absoluteBase: '/repo', pathFromBase: '.pvl.pvl-tmp' }, isDefault: true }
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
   * // { absolutePath: '/repo/.pvl.pvl-old', relativePath: { absoluteBase: '/repo', pathFromBase: '.pvl.pvl-old' }, isDefault: true }
   * ```
   */
  public getOldDestination(): Destination {
    return this.toSiblingDestination(BACKUP_DESTINATION_SUFFIX);
  }

  /**
   * This Destination with `suffix` appended to its name, in the same parent
   * and against the same base directory.
   *
   * ```ts
   * // destination.absolutePath '/repo/.pvl'
   * destination.toSiblingDestination('.pvl-tmp').absolutePath // '/repo/.pvl.pvl-tmp'
   * ```
   */
  private toSiblingDestination(suffix: string): Destination {
    return new Destination(
      createAbsolutePathWithRelative(
        `${this.absolutePath}${suffix}`,
        this.relativePath.absoluteBase,
      ),
      this.isDefault,
    );
  }
}
