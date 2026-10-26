// The package's public entry: one compilation run, the config it reads, and
// the diagnostics it reports.
export * from './compilation/runCompilation.js';
export * from './compilation/types.js';
export * from './config/configValidationSchemas.js';
export * from './config/types.js';
export * from './config/consts.js';
export * from './diagnostics/consts.js';
export * from './diagnostics/diagnostic.js';
export * from './diagnostics/utils.js';
export * from './diagnostics/enums.js';
// bin.ts is the `pvl` executable and cli/ its in-process entry, so the library
// never loads yargs. ast/, compilation/, config/, destination/, emitters/,
// exceptions/, frame/, issue.ts, module.ts, path.ts, precheck.ts, scanner.ts, schemas/,
// scope.ts, specifier.ts, tsMorphProject.ts and utils.ts are runCompilation()'s internal steps;
// config/ and diagnostics/ export their public files above. consts.ts,
// enums.ts and config/defaultConfig.ts hold every internal constant and enum, kept
// out so semver doesn't bind them.
