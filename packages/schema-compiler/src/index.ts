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
// errorMessage.ts, exceptions/, frame/, issue/, module/, path/, precheck/, runtimeArgument/,
// scanner/, schemas/, scope.ts, spelledType/, specifier/ and tsMorphProject/ are runCompilation()'s internal steps;
// config/ and diagnostics/ export their public files above. config/defaultConfig.ts
// holds the package-wide internal defaults, kept out so semver doesn't bind them.
