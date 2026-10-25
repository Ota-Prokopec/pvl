import type { PvlConfig } from './config.js';

export const defaultConfig = {
  include: ['src/schemas/**/*.ts'],
  rootDir: 'src',
  withTypes: true,
  watch: true,
  destination: '.pvl',
} as const satisfies PvlConfig;
