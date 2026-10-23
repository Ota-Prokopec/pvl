// The package's public entry: one compilation run, the config it reads, and
// the diagnostics it reports.
export * from './compilation/runCompilation.js';
export * from './config/config.js';
export * from './consts.js';
export * from './diagnostics/diagnostic.js';
export * from './diagnostics/diagnostics.js';
export * from './enums.js';
// bin.ts is the `pvl` executable and cli/ its in-process entry, so the library
// never loads yargs. ast/, barrel.ts, compilation/, config/, destination/, emitters/,
// issue.ts, module.ts, path.ts, precheck.ts, scanner.ts, schemas/, specifier.ts,
// tsMorphProject.ts and utils.ts are runCompilation()'s internal steps;
// config/ and diagnostics/ export their public files above.
