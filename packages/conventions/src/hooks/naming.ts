/** The naming patterns from `docs/agents/git-workflow.md`, shared by the hooks. */

/** `<type>/<slug>`, e.g. `feat/enum-factory`. */
export const BRANCH_NAME = /^(?:feat|fix|docs|refactor|test|chore)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `<type>(<scope>): <description>`, the scope optional, e.g. `feat(schema): add pvl.enum()`. */
export const CONVENTIONAL_SUBJECT =
  /^(?:feat|fix|docs|refactor|test|chore)(?:\([a-z0-9-]+\))?!?: \S/;
