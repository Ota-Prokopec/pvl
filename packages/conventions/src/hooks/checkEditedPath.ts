/** The rules a file edit can break, checked before Claude Code's Edit, Write or NotebookEdit runs. */
import * as path from 'node:path';

const MEMORY =
  "Persist knowledge in the repo, never in the agent's internal memory: put the workflow, convention or correction in an `AGENTS.md`, or a doc under `docs/agents/` linked from one." as const;

export type CheckEditedPathArgs = {
  editedPath: string;
  cwd: string;
};

/** Every rule editing `editedPath` (resolved against `cwd`) breaks; empty when the edit may run. */
export const checkEditedPath = ({ editedPath, cwd }: CheckEditedPathArgs): string[] => {
  const absolute = path.resolve(cwd, editedPath).split(path.sep).join('/');
  return /\/\.claude\/projects\/[^/]+\/memory\//.test(absolute) ? [MEMORY] : [];
};
