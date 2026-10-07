/**
 * The playground tour: one top-to-bottom pass over `@pvl/schema`, a section
 * per behavior, each validating one passing and one failing value and printing
 * what came back. Run it with `pnpm start`, or `pnpm dev` to re-run on every
 * edit to this file or to the library itself.
 *
 * Nothing asserts on this output, so any section can be copied, mangled, or
 * deleted while poking at one behavior — each builds its own Schema rather than
 * carrying one down the file. See AGENTS.md next door for why a build has to
 * have happened before this runs.
 */
import { inspect } from 'node:util';
import { pvl, type Issue, type Result } from '@pvl/schema';

/**
 * `inspect` rather than `JSON.stringify`: it renders a `bigint` (which
 * `JSON.stringify` throws on, and which section 1 needs) and keeps a nested
 * value on one line. The cost is that it quotes strings the way Node does,
 * with single quotes — accepted deliberately, since `bigint` support is
 * load-bearing here and the quote style is not.
 */
const INSPECT_OPTIONS = { depth: null, breakLength: Infinity } as const;

/** How wide a section's rule is drawn, in characters. */
const RULE_WIDTH = 68 as const;

/** A throwaway shape, recognizable at a glance and modelling nothing real. */
const ROLE = {
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
} as const;

const section = (title: string): void => {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, RULE_WIDTH - title.length))}`);
};

/**
 * An `Issue`'s `path` rendered as the leading segment of its output line:
 * dotted notation with array indices in brackets — `address.city `, `[0] `,
 * `members[1].name ` — so a nested location reads the way it would be written
 * in TypeScript, plus the space that separates it from the `IssueCode`. An
 * `Issue` reported at the root has no `path`, and yields the empty string so
 * its line reads `✗ [CODE]: message`.
 */
const formatPathPrefix = (path: Issue['path']): string => {
  let formatted = '';
  for (const key of path ?? []) {
    formatted +=
      typeof key === 'number' ? `[${key}]` : formatted === '' ? String(key) : `.${String(key)}`;
  }
  return formatted === '' ? '' : `${formatted} `;
};

type ReportArgs = {
  readonly label: string;
  readonly result: Result<unknown>;
};

/**
 * The whole output contract, in one place: a label line, then one line per
 * outcome. A success prints the accepted value — after a Transform that is the
 * transformed value, not the input. A failure prints one line per `Issue`:
 * path, `IssueCode`, message. The raw `Result` is never printed; the Standard
 * Schema envelope buries the part worth reading.
 */
const report = ({ label, result }: ReportArgs): void => {
  console.log(`\n${label}`);
  if (!result.issues) {
    console.log(`✓ ${inspect(result.value, INSPECT_OPTIONS)}`);
    return;
  }
  for (const issue of result.issues) {
    console.log(`✗ ${formatPathPrefix(issue.path)}[${issue.code}]: ${issue.message}`);
  }
};

section('1. Primitives');

report({ label: 'pvl.string() ← "Ada"', result: pvl.string().validate('Ada') });
report({ label: 'pvl.string() ← 42', result: pvl.string().validate(42) });
report({ label: 'pvl.number() ← 36', result: pvl.number().validate(36) });
report({ label: 'pvl.number() ← "36"', result: pvl.number().validate('36') });
report({ label: 'pvl.boolean() ← true', result: pvl.boolean().validate(true) });
report({ label: 'pvl.boolean() ← 0', result: pvl.boolean().validate(0) });
report({ label: 'pvl.bigint() ← 36n', result: pvl.bigint().validate(36n) });
report({ label: 'pvl.bigint() ← 36', result: pvl.bigint().validate(36) });

section('2. literal and enum');

// Both reject with INVALID_VALUE; what differs is the message — a literal
// names the one value it accepts, an enum lists every member.
const adminRole = pvl.literal(ROLE.ADMIN);
report({ label: 'pvl.literal("ADMIN") ← "ADMIN"', result: adminRole.validate('ADMIN') });
report({ label: 'pvl.literal("ADMIN") ← "EDITOR"', result: adminRole.validate('EDITOR') });

const anyRole = pvl.enum(ROLE);
report({ label: 'pvl.enum(ROLE) ← "EDITOR"', result: anyRole.validate('EDITOR') });
report({ label: 'pvl.enum(ROLE) ← "OWNER"', result: anyRole.validate('OWNER') });

section('3. Object, flat');

const user = pvl.object({
  name: pvl.string(),
  age: pvl.number(),
  role: pvl.enum(ROLE),
});
report({ label: 'valid user', result: user.validate({ name: 'Ada', age: 36, role: 'EDITOR' }) });
// Every key is checked even after an earlier one fails, so all three Issues
// arrive in one pass, each pathed with its own key.
report({
  label: 'every field wrong',
  result: user.validate({ name: 42, age: 'old', role: 'OWNER' }),
});

section('4. Array');

const tags = pvl.array(pvl.string());
report({
  label: 'pvl.array(pvl.string()) ← ["math", "logic"]',
  result: tags.validate(['math', 'logic']),
});
// One Issue per failing element, pathed with its index.
report({
  label: 'pvl.array(pvl.string()) ← ["math", 7, false]',
  result: tags.validate(['math', 7, false]),
});

section('5. Union');

// No member accepted the value, so one INVALID_UNION Issue is reported,
// followed by every member's own rejection.
const identifier = pvl.union([pvl.string(), pvl.number()]);
report({ label: 'pvl.union([string, number]) ← 36', result: identifier.validate(36) });
report({ label: 'pvl.union([string, number]) ← true', result: identifier.validate(true) });

section('6. optional() and nullable()');

const optionalName = pvl.string().optional();
report({ label: 'pvl.string().optional() ← undefined', result: optionalName.validate(undefined) });
report({ label: 'pvl.string().optional() ← null', result: optionalName.validate(null) });

const nullableName = pvl.string().nullable();
report({ label: 'pvl.string().nullable() ← null', result: nullableName.validate(null) });
report({ label: 'pvl.string().nullable() ← undefined', result: nullableName.validate(undefined) });

section('7. Refinement');

const adultAge = pvl.number().refine((age) => age >= 18);
report({ label: 'pvl.number().refine(age >= 18) ← 36', result: adultAge.validate(36) });
report({ label: 'pvl.number().refine(age >= 18) ← 12', result: adultAge.validate(12) });

// The same rejection, with the `message` option carried onto the Issue in
// place of the default.
const nonBlankName = pvl.string().refine((name) => name.trim().length > 0, {
  message: 'Name must not be blank',
});
report({
  label: 'pvl.string().refine(not blank, { message }) ← "   "',
  result: nonBlankName.validate('   '),
});

section('8. Transform');

// A Transform runs last, and only once validation has succeeded, so the
// accepted value printed below is not the input that went in.
const shoutedName = pvl.string().transform((name) => name.trim().toUpperCase());
report({
  label: 'pvl.string().transform(trim + upper) ← "  Ada  "',
  result: shoutedName.validate('  Ada  '),
});
report({ label: 'pvl.string().transform(trim + upper) ← 42', result: shoutedName.validate(42) });

section('9. Coercion');

// A Coercion runs before the type check — the mirror image of the Transform
// above. It converts the input, then the schema's normal check decides.
const coercedAge = pvl.number().coerce();
report({ label: 'pvl.number().coerce() ← "36"', result: coercedAge.validate('36') });

const coercedId = pvl.bigint().coerce();
report({ label: 'pvl.bigint().coerce() ← "36"', result: coercedId.validate('36') });
// An unconvertible input falls through unchanged and fails the ordinary type
// check: INVALID_TYPE, not a Coercion-specific Issue.
report({ label: 'pvl.bigint().coerce() ← "12.5"', result: coercedId.validate('12.5') });

section('10. Deep path — object of array of object');

const team = pvl.object({
  name: pvl.string(),
  members: pvl.array(
    pvl.object({
      name: pvl.string(),
      role: pvl.enum(ROLE),
      address: pvl.object({ city: pvl.string() }).optional(),
    }),
  ),
});

report({
  label: 'valid team',
  result: team.validate({
    name: 'Analytical Engine',
    members: [
      { name: 'Ada', role: 'ADMIN', address: { city: 'London' } },
      { name: 'Charles', role: 'EDITOR' },
    ],
  }),
});

// The finale: a path through a key, an index, a key, and a key again.
report({
  label: 'unknown role and a non-string city, both on members[1]',
  result: team.validate({
    name: 'Analytical Engine',
    members: [
      { name: 'Ada', role: 'ADMIN', address: { city: 'London' } },
      { name: 'Charles', role: 'OWNER', address: { city: 7 } },
    ],
  }),
});

console.log('');
