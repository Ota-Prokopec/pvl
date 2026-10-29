// The quick runner of the benchmark behind ADR-0023: is one `_validate`
// holding a whole Schema's tree (V1, what `pvl compile` emits) faster than a
// parent calling a child per nested object or array (V2) or per key (V3)? Run
// it with `pnpm bench`. It first asserts every variant returns the same Result
// for every input, then measures, each against V1: the time and heap a hot
// validation takes (mitata, all in this one process, so noisy), each
// variant's module size, and its cold start in a fresh `node` process.
// `isolated.ts` measures the hot time reliably.
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import * as util from 'node:util';
import * as zlib from 'node:zlib';
import { bench, do_not_optimize, run } from 'mitata';
import ts from 'typescript';
import * as inline from '../.pvl/schemas/benchmark.js';
import { NANOSECONDS_PER_MILLISECOND, VARIANT_LABEL } from './consts.js';
import { VARIANT } from './enums.js';
import { formatBytes, formatMilliseconds, formatPercent, median } from './format.js';
import { INPUT_KINDS, INPUTS, SCHEMA_NAMES } from './inputs.js';
import * as perComposite from './variants/perComposite.js';
import * as perKey from './variants/perKey.js';

type Validator = { validate: (value: unknown) => unknown };

type HotMeasurement = { milliseconds: number; bytes: number };

type TableRow = { label: string; values: number[] };

const VARIANTS = [
  { name: VARIANT_LABEL[VARIANT.V1], schemas: inline, source: '.pvl/schemas/benchmark.ts' },
  {
    name: VARIANT_LABEL[VARIANT.V2],
    schemas: perComposite,
    source: 'src/variants/perComposite.ts',
  },
  { name: VARIANT_LABEL[VARIANT.V3], schemas: perKey, source: 'src/variants/perKey.ts' },
] as const satisfies ReadonlyArray<{
  name: string;
  schemas: Record<string, Validator>;
  source: string;
}>;

const COLD_START_RUNS = 25 as const;
const ADR_0023_TOLERANCE = 0.05 as const;
const CACHE_DIRECTORY = 'node_modules/.cache/pvl-bench' as const;

const CASES = SCHEMA_NAMES.flatMap((schemaName) =>
  INPUT_KINDS.map((inputKind) => ({
    label: `${schemaName} (${inputKind})`,
    schemaName,
    input: INPUTS[schemaName][inputKind],
  })),
);

/** Throws unless every variant returns V1's Result for every input, so no variant wins by checking less. */
const assertVariantsAgree = (): void => {
  for (const { label, schemaName, input } of CASES) {
    const [reference, ...others] = VARIANTS.map((variant) =>
      variant.schemas[schemaName].validate(input),
    );
    others.forEach((result, index) => {
      if (!util.isDeepStrictEqual(result, reference)) {
        throw new Error(`${VARIANTS[index + 1]?.name} disagrees with V1 on ${label}`);
      }
    });
  }
};

const formatTableLine = (cells: string[], widths: number[]): string =>
  cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ');

/** Prints one table: a row per case, V1's value, then each other variant's value and its difference from V1. */
const printTable = (
  title: string,
  rows: readonly TableRow[],
  format: (value: number) => string,
): void => {
  const header = [
    '',
    ...VARIANTS.map((variant, index) => (index === 0 ? variant.name : `${variant.name} (vs V1)`)),
  ];
  const body = rows.map(({ label, values }) => [
    label,
    ...values.map((value, index) =>
      index === 0
        ? format(value)
        : `${format(value)} (${formatPercent(value, values[0] ?? value)})`,
    ),
  ]);
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...body.map((row) => row[column]?.length ?? 0)),
  );
  console.log(`\n${title}`);
  console.log(formatTableLine(header, widths));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  body.forEach((row) => console.log(formatTableLine(row, widths)));
};

/** Measures every case on every variant with mitata, and returns its average time (ms) and heap (bytes) per validation. */
const measureHot = async (): Promise<Map<string, HotMeasurement>> => {
  for (const { label, schemaName, input } of CASES) {
    for (const variant of VARIANTS) {
      const schema: Validator = variant.schemas[schemaName];
      bench(`${label} ${variant.name}`, () => do_not_optimize(schema.validate(input)));
    }
  }
  const { benchmarks } = await run({ format: 'quiet' });
  return new Map(
    benchmarks.map((trial) => {
      const stats = trial.runs[0]?.stats;
      return [
        trial.alias,
        {
          milliseconds: (stats?.avg ?? Number.NaN) / NANOSECONDS_PER_MILLISECOND,
          bytes: stats?.heap?.avg ?? Number.NaN,
        },
      ];
    }),
  );
};

const hotRows = (
  hot: Map<string, HotMeasurement>,
  pick: (measurement: HotMeasurement) => number,
): TableRow[] =>
  CASES.map(({ label }) => ({
    label,
    values: VARIANTS.map((variant) => {
      const measurement = hot.get(`${label} ${variant.name}`);
      return measurement === undefined ? Number.NaN : pick(measurement);
    }),
  }));

/** Transpiles each variant's module to the JavaScript a bundler would ship, without its types. */
const transpileVariants = (): string[] => {
  fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
  return VARIANTS.map((variant, index) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(variant.source, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    });
    const file = path.join(CACHE_DIRECTORY, `v${index + 1}.mjs`);
    fs.writeFileSync(file, outputText);
    return file;
  });
};

/**
 * Starts a fresh `node` and times importing `file` (once `@pcvl/schema` is
 * loaded) and then the first validation of every Schema.
 */
const measureColdStart = (
  file: string,
  inputsFile: string,
): { load: number; firstCall: number } => {
  const script = `
    import { readFileSync } from 'node:fs';
    await import('@pcvl/schema');
    const inputs = JSON.parse(readFileSync(${JSON.stringify(inputsFile)}, 'utf8'));
    const start = performance.now();
    const schemas = await import(${JSON.stringify(url.pathToFileURL(file).href)});
    const loaded = performance.now();
    for (const name of ${JSON.stringify(SCHEMA_NAMES)}) schemas[name].validate(inputs[name]);
    console.log(JSON.stringify({ load: loaded - start, firstCall: performance.now() - loaded }));
  `;
  const output = childProcess.execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      encoding: 'utf8',
    },
  );
  return JSON.parse(output) as { load: number; firstCall: number };
};

assertVariantsAgree();
console.log('Every variant returns the same Result for every input.');

const files = transpileVariants();
const sources = files.map((file) => fs.readFileSync(file));
printTable(
  'Module size, transpiled to JavaScript (bytes)',
  [
    { label: 'raw', values: sources.map((source) => source.byteLength) },
    { label: 'gzip', values: sources.map((source) => zlib.gzipSync(source).byteLength) },
  ],
  formatBytes,
);

const inputsFile = path.join(CACHE_DIRECTORY, 'inputs.json');
fs.writeFileSync(
  inputsFile,
  JSON.stringify(Object.fromEntries(SCHEMA_NAMES.map((name) => [name, INPUTS[name].valid]))),
);
const coldRuns = files.map(() => ({ load: [] as number[], firstCall: [] as number[] }));
// Interleaved, so a slower stretch of the machine hits every variant alike.
for (let attempt = 0; attempt < COLD_START_RUNS; attempt++) {
  files.forEach((file, index) => {
    const { load, firstCall } = measureColdStart(file, inputsFile);
    coldRuns[index]?.load.push(load);
    coldRuns[index]?.firstCall.push(firstCall);
  });
}
printTable(
  `Cold start, median of ${COLD_START_RUNS} fresh processes (ms)`,
  [
    { label: 'import the module', values: coldRuns.map((runs) => median(runs.load)) },
    {
      label: 'first validation of every Schema',
      values: coldRuns.map((runs) => median(runs.firstCall)),
    },
  ],
  formatMilliseconds,
);

console.log('\nMeasuring hot validations with mitata…');
const hot = await measureHot();
const timeRows = hotRows(hot, (measurement) => measurement.milliseconds);
printTable('Hot validation, average time per call (ms)', timeRows, formatMilliseconds);
printTable(
  'Hot validation, average heap allocated per call (bytes)',
  hotRows(hot, (measurement) => measurement.bytes),
  formatBytes,
);

const slowerCases = timeRows.filter(
  ({ values: [v1 = 0, v2 = 0] }) => v2 > v1 * (1 + ADR_0023_TOLERANCE),
);
console.log(
  slowerCases.length === 0
    ? `\nADR-0023: V2 stays within ${ADR_0023_TOLERANCE * 100} % of V1 on every case, so delegating per composite is worth reopening.`
    : `\nADR-0023 holds: V2 is more than ${ADR_0023_TOLERANCE * 100} % slower than V1 on ${slowerCases.map(({ label }) => label).join(', ')}.`,
);
