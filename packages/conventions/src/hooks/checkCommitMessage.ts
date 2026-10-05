/** The commit subject rule from `docs/agents/git-workflow.md`, checked by lefthook's `commit-msg` hook. */
import { CONVENTIONAL_SUBJECT } from './naming.ts';

// Subjects git writes itself (merges, reverts, autosquash markers).
const GENERATED_SUBJECT = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;

/** The rule the commit message breaks, as the instruction to follow, or `undefined` when it's fine. */
export const checkCommitMessage = (message: string): string | undefined => {
  const subject =
    message.split('\n').find((line): boolean => line.trim() !== '' && !line.startsWith('#')) ?? '';
  if (GENERATED_SUBJECT.test(subject) || CONVENTIONAL_SUBJECT.test(subject)) {
    return undefined;
  }
  return `The commit subject "${subject}" doesn't follow \`<type>(<scope>): <description>\`, where \`<type>\` is feat, fix, docs, refactor, test or chore and the scope is optional (e.g. \`feat(schema): add pvl.enum()\`).`;
};
