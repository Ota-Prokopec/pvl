// Each setting's default, which the config resolver and the Destination
// Directory fall back on. Internal: the barrel leaves it out, so semver
// doesn't bind it.
import type { PvlConfig } from './types.js';

/** Each setting's default; `destination` is where the Destination Directory goes, relative to the base directory, when it is unset. */
export const defaultConfig = {
  include: ['src/schemas/**/*.ts'],
  rootDir: 'src',
  destination: '.pvl',
} satisfies PvlConfig;
