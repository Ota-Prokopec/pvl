/** The rules a file edit can break, checked before Claude Code's Edit, Write or NotebookEdit runs. */
import { resolve, sep } from 'node:path';

const MEMORY =
  "Persist knowledge in the repo, never in the agent's internal memory: put the workflow, convention or correction in an `AGENTS.md`, or a doc under `docs/agents/` linked from one." as const;

export type CheckEditedPathArgs = {
  path: string;
  cwd: string;
};

/** Every rule editing `path` (resolved against `cwd`) breaks; empty when the edit may run. */
export const checkEditedPath = ({ path, cwd }: CheckEditedPathArgs): string[] => {
  const absolute = resolve(cwd, path).split(sep).join('/');
  return /\/\.claude\/projects\/[^/]+\/memory\//.test(absolute) ? [MEMORY] : [];
};
