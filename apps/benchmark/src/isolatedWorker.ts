// One measurement of the isolated runner (`isolated.ts`), in a process of its
// own: hot-validates one Schema's input on one variant with mitata and prints
// the time per call (ns) as JSON. It imports only that variant's module.
import { do_not_optimize, measure } from 'mitata';
import { INPUT_KINDS, INPUTS, SCHEMA_NAMES } from './inputs.js';
import { VARIANT, type Variant } from './enums.js';

type Validator = { validate: (value: unknown) => unknown };

const importVariant = async (variant: Variant): Promise<Record<string, Validator>> => {
  switch (variant) {
    case VARIANT.V1:
      return import('../.pvl/schemas/benchmark.js');
    case VARIANT.V2:
      return import('./variants/perComposite.js');
    case VARIANT.V3:
      return import('./variants/perKey.js');
  }
};

const VARIANTS = Object.values(VARIANT);

const [variantArgument, schemaName, inputKind] = process.argv.slice(2);
const variant = VARIANTS.find((value) => value === variantArgument);
const schemaKey = SCHEMA_NAMES.find((name) => name === schemaName);
const inputKey = INPUT_KINDS.find((kind) => kind === inputKind);
if (variant === undefined || schemaKey === undefined || inputKey === undefined) {
  throw new Error(
    `Usage: isolatedWorker.ts <${VARIANTS.join('|')}> <${SCHEMA_NAMES.join('|')}> <${INPUT_KINDS.join('|')}>`,
  );
}

const schema = (await importVariant(variant))[schemaKey];
if (schema === undefined) {
  throw new Error(`The ${variant} module exports no \`${schemaKey}\``);
}
const input = INPUTS[schemaKey][inputKey];
const stats = await measure(() => do_not_optimize(schema.validate(input)));
console.log(JSON.stringify({ p50: stats.p50, avg: stats.avg }));
