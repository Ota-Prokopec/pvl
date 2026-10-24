// The isolated runner: measures every Schema × input × variant `--rounds`
// times (default 10), each in a fresh `node` running `isolatedWorker.ts`, in
// a new shuffled order every round, so no variant gains from what ran before
// it. Then it prints, per case, the median over the rounds of each run's
// median time per call, the fastest and slowest run, the difference from V1,
// and the winner: the fastest, when the next is more than 5 % slower.
// Run it with `pnpm bench:isolated`, optionally `-- --rounds 3 --schemas list,huge`.
import * as childProcess from 'node:child_process';
import * as url from 'node:url';
import * as util from 'node:util';
import { NANOSECONDS_PER_MILLISECOND, VARIANT_LABEL } from './consts.js';
import { VARIANT, type Variant } from './enums.js';
import { formatMilliseconds, formatPercent, median } from './format.js';
import { INPUT_KINDS, SCHEMA_NAMES } from './inputs.js';

type Run = { variant: Variant; label: string; p50: number };

const VARIANTS = Object.values(VARIANT);
const WIN_MARGIN = 0.05 as const;
const WORKER = url.fileURLToPath(new URL('isolatedWorker.ts', import.meta.url));

const { values: options } = util.parseArgs({
  options: { rounds: { type: 'string', default: '10' }, schemas: { type: 'string' } },
});
const rounds = Number(options.rounds);
const schemaNames =
  options.schemas === undefined
    ? SCHEMA_NAMES
    : SCHEMA_NAMES.filter((name) => options.schemas?.split(',').includes(name));

const cases = schemaNames.flatMap((schemaName) =>
  INPUT_KINDS.map((inputKind) => ({
    label: `${schemaName} (${inputKind})`,
    schemaName,
    inputKind,
  })),
);
const jobs = cases.flatMap((testCase) => VARIANTS.map((variant) => ({ ...testCase, variant })));

/** Runs one job in a fresh `node` and returns its median time per call (ns). */
const measureInFreshProcess = ({
  variant,
  schemaName,
  inputKind,
}: (typeof jobs)[number]): number => {
  const output = childProcess.execFileSync(
    process.execPath,
    ['--expose-gc', '--import', 'tsx', WORKER, variant, schemaName, inputKind],
    { encoding: 'utf8' },
  );
  return (JSON.parse(output.trim().split('\n').at(-1) ?? '{}') as { p50: number }).p50;
};

/** Returns `items` in a random order (Fisher–Yates). */
const shuffle = <T>(items: readonly T[]): T[] => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other] as T, shuffled[index] as T];
  }
  return shuffled;
};

const formatRange = (times: readonly number[]): string =>
  `[${(Math.min(...times) / NANOSECONDS_PER_MILLISECOND).toPrecision(3)}–${(Math.max(...times) / NANOSECONDS_PER_MILLISECOND).toPrecision(3)}]`;

const runs: Run[] = [];
for (let round = 1; round <= rounds; round++) {
  for (const job of shuffle(jobs)) {
    runs.push({ variant: job.variant, label: job.label, p50: measureInFreshProcess(job) });
  }
  console.log(`round ${round}/${rounds} done`);
}

console.log(`\nMedian time per call over ${rounds} fresh-process rounds [fastest–slowest run]\n`);
console.log(`| Case | ${VARIANTS.map((variant) => VARIANT_LABEL[variant]).join(' | ')} | Winner |`);
console.log(`|---|${VARIANTS.map(() => '---|').join('')}---|`);
const wins = new Map<Variant, number>();
for (const { label } of cases) {
  const times = (variant: Variant): number[] =>
    runs.filter((run) => run.label === label && run.variant === variant).map((run) => run.p50);
  const medians = VARIANTS.map((variant) => ({ variant, time: median(times(variant)) }));
  const [fastest, second] = [...medians].sort((left, right) => left.time - right.time);
  const winner =
    fastest !== undefined && second !== undefined && second.time > fastest.time * (1 + WIN_MARGIN)
      ? fastest.variant
      : undefined;
  if (winner !== undefined) {
    wins.set(winner, (wins.get(winner) ?? 0) + 1);
  }
  const baseline = medians[0]?.time ?? Number.NaN;
  const cells = medians.map(
    ({ variant, time }, index) =>
      `${formatMilliseconds(time / NANOSECONDS_PER_MILLISECOND)}${index === 0 ? '' : ` (${formatPercent(time, baseline)})`} ${formatRange(times(variant))}`,
  );
  console.log(
    `| ${label} | ${cells.join(' | ')} | ${winner === undefined ? 'tie (≤5 %)' : VARIANT_LABEL[winner]} |`,
  );
}
console.log(
  `\nClear wins: ${VARIANTS.map((variant) => `${VARIANT_LABEL[variant]} ${wins.get(variant) ?? 0}`).join(', ')}`,
);
