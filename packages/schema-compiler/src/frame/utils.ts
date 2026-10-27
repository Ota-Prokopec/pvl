// The pure functions `Frame` composes a Schema's checks and its Compiled
// Schema's type with, which read nothing of the Frame itself: the grouping
// of its pre-modifiers' parts, a composite's statements behind its base
// check, and the type a Compiled Schema is cast up to.
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type { EmittedCheck } from '../emitters/types/emittedText.js';
import type {
  CheckingTarget,
  EmittedPreModifierStep,
  SchemaCompositeParts,
} from '../emitters/types/schemaParts.js';
import { composeBlock, js } from '../emitters/utils/js.js';
import {
  emitIssueCountBeforeValueChildrenValidationName,
  emitNoNewIssuesCondition,
} from '../issue.js';
import { STANDALONE_MARKER_TYPE_NAME } from './consts.js';
import type { GroupedPreModifierStep } from './types.js';

/** What {@link groupPreModifierSteps} groups: a Schema's pre-modifiers' parts. */
export type GroupPreModifierStepsArgs = {
  steps: ReadonlyArray<EmittedPreModifierStep>;
};

/**
 * `steps`, a Schema's pre-modifiers' parts, in chain order, as ADR-0010
 * runs them: a conversion replaces the value before what follows it, and
 * conditions chained one after another are grouped, to share one guard,
 * as any one of them holding skips the rest. `Frame.composeChecks` wraps
 * the checks in them.
 *
 * ```ts
 * groupPreModifierSteps({ steps: [{ shortCircuitCondition: 'field0 === null' }, { shortCircuitCondition: 'field0 === undefined' }] })
 * // [{ conditions: ['field0 === null', 'field0 === undefined'] }]
 * groupPreModifierSteps({ steps: [{ coercion: 'field0 = String(field0);' }, { shortCircuitCondition: 'field0 === undefined' }] })
 * // [{ coercion: 'field0 = String(field0);' }, { conditions: ['field0 === undefined'] }]
 * ```
 */
export const groupPreModifierSteps = ({
  steps,
}: GroupPreModifierStepsArgs): GroupedPreModifierStep[] => {
  return steps.reduce<GroupedPreModifierStep[]>((groups, step) => {
    if ('coercion' in step) {
      return [...groups, step];
    }
    const lastGroup = groups.at(-1);
    return lastGroup !== undefined && 'conditions' in lastGroup
      ? [
          ...groups.slice(0, -1),
          { conditions: [...lastGroup.conditions, step.shortCircuitCondition] },
        ]
      : [...groups, { conditions: [step.shortCircuitCondition] }];
  }, []);
};

/** What {@link composeCompositeStatements} composes: a composite's parts, besides its base check and its pre-modifiers' parts, at its target. */
export type ComposeCompositeStatementsArgs = {
  target: CheckingTarget;
  postModifierChecks: ReadonlyArray<EmittedCheck>;
  composite: SchemaCompositeParts;
};

/**
 * What a composite runs once its type check (base check) has passed, as
 * statements: the Frame's own locals, then its declarations, its
 * children's checks, its output statements, its post-modifiers' checks
 * behind their gate, which read the output its checks built, as the
 * interpreted path's post-modifiers read `_checkType`'s, and the handoff
 * of its output. Its children's checks
 * are set apart by a blank line before, between and after them when the
 * composite asks for it (`setsChildrenApart`), as an object does for its
 * fields, so the blank lines are the Frame's formatting, never a part.
 *
 * A post-modifier runs only once the type check has (ADR-0010), and a
 * composite's type check includes its children, so a composite's
 * post-modifiers are gated on the count of Issues taken before its
 * children (`if (issues.length === issueCountBeforeField0ChildrenValidation)`):
 * an unchanged count means no child added an Issue. The count is named
 * after the composite's value and declared here, along with the Gate, as
 * one `issues` array may already hold the parent's Issues.
 * The path local is there to report Issues under the composite, and only
 * checks push Issues, never a declaration or an output statement, so it
 * is declared when the composite has any: its children's, whose paths
 * extend it, or its post-modifiers', as `.strict()` reports an unknown
 * key at `[...path1, key]`. The output is put back on the value its parent
 * reads, or on `_validate`'s own `value` at the root.
 *
 * ```ts
 * composeCompositeStatements({ target: <field0 at [...path1, "tags"]>, postModifierChecks: ['if (field0.length < 1) { … }'], composite: <the composite parts of pvl.array(pvl.string()) at field0, locals ending in 2> })
 * // ['const path2 = [...path1, "tags"];', 'const issueCountBeforeField0ChildrenValidation = issues.length;', 'const output2: unknown[] = [];', 'for (…) { … }', 'if (issues.length === issueCountBeforeField0ChildrenValidation) {\n  if (output2.length < 1) { … }\n}', 'field0 = output2;']
 * composeCompositeStatements({ target: Frame.rootCheckingTarget, postModifierChecks: [], composite: <the composite parts of pvl.object({}) at the root, locals ending in 1> })
 * // ['const input1 = value as Record<string, unknown>;', '', 'const output1: Record<string, unknown> = {};', 'value = output1;']
 * ```
 */
export const composeCompositeStatements = ({
  target,
  postModifierChecks,
  composite: { locals, declarations, childChecks, setsChildrenApart, outputStatements },
}: ComposeCompositeStatementsArgs): string[] => {
  const hasPostModifierChecks = postModifierChecks.length > 0;
  const readsPath = childChecks.length > 0 || hasPostModifierChecks;
  const issueCount = emitIssueCountBeforeValueChildrenValidationName(target.value);
  return [
    ...(readsPath ? [js`const ${locals.path} = ${target.path};`] : []),
    ...(hasPostModifierChecks ? [js`const ${issueCount} = issues.length;`] : []),
    ...declarations,
    ...(setsChildrenApart
      ? ['', ...childChecks.flatMap((childCheck) => [childCheck, ''])]
      : childChecks),
    ...outputStatements,
    ...(hasPostModifierChecks
      ? [
          composeBlock({
            head: `if (${emitNoNewIssuesCondition(issueCount)})`,
            body: postModifierChecks.join('\n'),
          }),
        ]
      : []),
    js`${target.value} = ${locals.output};`,
  ];
};

/** What {@link spellCompiledSchemaType} spells a Compiled Schema's type from. */
export type SpellCompiledSchemaTypeArgs = {
  types: SchemaTypes;
  /** Whether it is marked `.standalone()`. */
  isStandalone: boolean;
  /** The type of its `shape` or `element`, as it exposes it: `{ readonly shape: {} }`. */
  shapeOrElementType: string | undefined;
};

/**
 * The type a Compiled Schema is cast up to, as `pvl.compile()` types it:
 * `PvlSchema` of its types, with the Standalone marker when it is marked,
 * and its `shape` or `element` when it has one.
 *
 * ```ts
 * spellCompiledSchemaType({ types: <string, string>, isStandalone: true, shapeOrElementType: undefined })
 * // 'PvlSchema<string, string> & PvlStandaloneMarker'
 * spellCompiledSchemaType({ types: <{ name: string }, { name: string }>, isStandalone: false, shapeOrElementType: '{ readonly shape: {} }' })
 * // 'PvlSchema<{ name: string }, { name: string }> & { readonly shape: {} }'
 * ```
 */
export const spellCompiledSchemaType = ({
  types: {
    input: { text: input },
    output: { text: output },
  },
  isStandalone,
  shapeOrElementType,
}: SpellCompiledSchemaTypeArgs): string => {
  return [
    `PvlSchema<${input}, ${output}>`,
    ...(isStandalone ? [STANDALONE_MARKER_TYPE_NAME] : []),
    ...(shapeOrElementType === undefined ? [] : [shapeOrElementType]),
  ].join(' & ');
};
