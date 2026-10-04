/**
 * Reads the repo's git worktrees for the developer scripts under `scripts/`
 * (`pnpm claude`, `pnpm claude-list`). Every function shells out to `git` in
 * the process's working directory.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';

export type Worktree = {
  path: string;
  /** The checked-out branch, or `undefined` on a detached HEAD. */
  branch: string | undefined;
  /** Locked with `git worktree lock`, as Claude Code does to every worktree it creates. */
  locked: boolean;
};

/** Runs `git` and returns its trimmed stdout; a failure throws with git's stderr in the message. */
export const git = (args: string[]): string => {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
};

/** One `git worktree list --porcelain` block as attribute → value; a bare attribute such as `prunable` maps to `''`. */
const parseWorktreeBlock = (block: string): Map<string, string> => {
  return new Map(
    block.split('\n').map((line): [string, string] => {
      const [attribute = '', ...value] = line.split(' ');
      return [attribute, value.join(' ')];
    }),
  );
};

const readWorktreeBlocks = (): Map<string, string>[] => {
  return git(['worktree', 'list', '--porcelain']).split('\n\n').map(parseWorktreeBlock);
};

/**
 * Every worktree with files on disk: a bare repository has none, and a
 * `prunable` worktree's directory is gone. A locked worktree whose directory is
 * gone is never `prunable`, hence the separate existence check.
 */
export const listWorktrees = (): Worktree[] => {
  return readWorktreeBlocks().flatMap((attributes): Worktree[] => {
    const path = attributes.get('worktree');
    if (
      path === undefined ||
      attributes.has('bare') ||
      attributes.has('prunable') ||
      !existsSync(path)
    ) {
      return [];
    }
    return [
      {
        path: realpathSync(path),
        branch: attributes.get('branch')?.replace(/^refs\/heads\//, ''),
        locked: attributes.has('locked'),
      },
    ];
  });
};

/** How many entries `git worktree prune` will remove: the unlocked worktrees whose directory is gone. */
export const countPrunableWorktrees = (): number => {
  return readWorktreeBlocks().filter((attributes) => attributes.has('prunable')).length;
};

/** The worktree the process runs in. */
export const getCurrentWorktreePath = (): string => {
  return realpathSync(git(['rev-parse', '--show-toplevel']));
};

/** The main checkout: the common git dir is its `.git`, whichever worktree this runs in. */
export const getMainCheckoutPath = (): string => {
  return dirname(realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir'])));
};
