/** Shared lookups over the `@eslint/json` AST for the `package.json`/`tsconfig.json` rules. */
import type { JSONRuleVisitor } from '@eslint/json';

export type DocumentNode = Parameters<NonNullable<JSONRuleVisitor['Document']>>[0];
export type ObjectNode = Parameters<NonNullable<JSONRuleVisitor['Object']>>[0];
export type MemberNode = Parameters<NonNullable<JSONRuleVisitor['Member']>>[0];

/** The top-level object of a JSON document, or `undefined` when the document is something else. */
export const rootObject = (document: DocumentNode): ObjectNode | undefined => {
  return document.body.type === 'Object' ? document.body : undefined;
};

/** The member named `name` in `object`, or `undefined`. */
export const findMember = (object: ObjectNode, name: string): MemberNode | undefined => {
  return object.members.find(
    (member): boolean => member.name.type === 'String' && member.name.value === name,
  );
};
