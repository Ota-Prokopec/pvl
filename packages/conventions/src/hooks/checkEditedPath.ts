/** The rules a file edit can break, checked before Claude Code's Edit, Write or NotebookEdit runs. */
import { resolve, sep } from 'node:path';

const SKILLS =
  'Skills under `.agents/skills/` (and their `.claude/skills` symlinks) are installed from an external source, so a hand edit is lost on the next install. Raise the change with the user, or layer it in `docs/specification/skill-extensions.md`.' as const;
const MEMORY =
  "Persist knowledge in the repo, never in the agent's internal memory: put the workflow, convention or correction in an `AGENTS.md`, or a doc under `docs/agents/` linked from one." as const;

/** Every rule editing `path` (resolved against `cwd`) breaks; empty when the edit may run. */
export const checkEditedPath = (path: string, cwd: string): string[] => {
  const absolute = resolve(cwd, path).split(sep).join('/');
  const reasons: string[] = [];
  if (absolute.includes('/.agents/skills/') || absolute.includes('/.claude/skills/')) {
    reasons.push(SKILLS);
  }
  if (/\/\.claude\/projects\/[^/]+\/memory\//.test(absolute)) {
    reasons.push(MEMORY);
  }
  return reasons;
};
