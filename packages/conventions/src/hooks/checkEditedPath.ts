/** The rules a file edit can break, checked before Claude Code's Edit, Write or NotebookEdit runs. */
import { resolve, sep } from 'node:path';

const SKILLS =
  'Skills listed in `skills-lock.json` (under `.agents/skills/` and their `.claude/skills` symlinks) are installed from an external source, so a hand edit is lost on the next install. Raise the change with the user, or layer it in `docs/specification/skill-extensions.md`.' as const;
const MEMORY =
  "Persist knowledge in the repo, never in the agent's internal memory: put the workflow, convention or correction in an `AGENTS.md`, or a doc under `docs/agents/` linked from one." as const;

const SKILL_PATH = /^(?<root>.*)\/\.(?:agents|claude)\/skills\/(?<name>[^/]+)/;

type IsInstalledSkillArgs = {
  root: string;
  name: string;
  readFile: CheckEditedPathArgs['readFile'];
};

/** Whether `root`'s `skills-lock.json` lists the skill `name`; true when the lock can't be read, so the guard fails closed. */
const isInstalledSkill = ({ root, name, readFile }: IsInstalledSkillArgs): boolean => {
  try {
    const lock: unknown = JSON.parse(readFile(`${root}/skills-lock.json`) ?? '');
    const skills =
      typeof lock === 'object' && lock !== null && 'skills' in lock ? lock.skills : undefined;
    return typeof skills !== 'object' || skills === null || name in skills;
  } catch {
    return true;
  }
};

export type CheckEditedPathArgs = {
  path: string;
  cwd: string;
  readFile: (path: string) => string | undefined;
};

/** Every rule editing `path` (resolved against `cwd`) breaks; empty when the edit may run. */
export const checkEditedPath = ({ path, cwd, readFile }: CheckEditedPathArgs): string[] => {
  const absolute = resolve(cwd, path).split(sep).join('/');
  const reasons: string[] = [];
  const skill = SKILL_PATH.exec(absolute)?.groups;
  if (
    skill?.root !== undefined &&
    skill.name !== undefined &&
    isInstalledSkill({ root: skill.root, name: skill.name, readFile })
  ) {
    reasons.push(SKILLS);
  }
  if (/\/\.claude\/projects\/[^/]+\/memory\//.test(absolute)) {
    reasons.push(MEMORY);
  }
  return reasons;
};
