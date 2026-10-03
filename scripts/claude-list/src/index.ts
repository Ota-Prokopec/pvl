/**
 * Removes git worktrees picked from a `@clack/prompts` multiselect. The main
 * checkout and the worktree this runs from are listed first but can't be
 * picked (gray); a worktree with uncommitted changes is yellow. After a
 * confirmation listing every pick, each worktree is force-removed (overriding
 * Claude Code's lock and any uncommitted changes), its branch is deleted when
 * merged into `main`, and a second multiselect offers the unmerged branches
 * for deletion. `git worktree prune` and a summary end the run; the exit code
 * is 1 if any removal or deletion failed.
 */
import { basename } from 'node:path';
import { styleText } from 'node:util';
import { cancel, confirm, intro, isCancel, log, multiselect, outro } from '@clack/prompts';
import {
  getCurrentWorktreePath,
  getMainCheckoutPath,
  git,
  listWorktrees,
  type Worktree,
} from '@repo/git-worktrees';

type Entry = Worktree & {
  /** The main checkout or the current worktree, neither of which can be removed. */
  isProtected: boolean;
  /** Uncommitted changes, untracked files included. */
  changedFiles: number;
  /** The branch is merged into `main`; `false` on a detached HEAD, which has no branch. */
  isMerged: boolean;
};

/** A failed `git` call, as the summary reports it. */
type Failure = {
  subject: string;
  message: string;
};

const MAIN_BRANCH = 'main';

const currentPath = getCurrentWorktreePath();
const mainCheckoutPath = getMainCheckoutPath();
const mergedBranches = new Set(
  git(['branch', '--merged', MAIN_BRANCH, '--format=%(refname:short)']).split('\n'),
);

const countChangedFiles = (path: string): number => {
  return git(['-C', path, 'status', '--porcelain'])
    .split('\n')
    .filter((line) => line !== '').length;
};

const toEntry = (worktree: Worktree): Entry => {
  return {
    ...worktree,
    isProtected: worktree.path === mainCheckoutPath || worktree.path === currentPath,
    changedFiles: countChangedFiles(worktree.path),
    isMerged: worktree.branch !== undefined && mergedBranches.has(worktree.branch),
  };
};

const labelEntry = (entry: Entry): string => {
  const tags = [
    entry.path === mainCheckoutPath && 'main checkout',
    entry.path === currentPath && 'current',
  ];
  const label = [basename(entry.path), ...tags.filter((tag) => tag !== false)].join(' · ');
  if (entry.isProtected) return styleText('gray', label);
  if (entry.changedFiles > 0) return styleText('yellow', label);
  return label;
};

const hintEntry = (entry: Entry): string => {
  const tags = [
    entry.branch ?? 'detached HEAD',
    entry.branch !== undefined && !entry.isMerged && 'unmerged',
    entry.locked && 'locked',
    entry.changedFiles > 0 &&
      `dirty (${entry.changedFiles} ${entry.changedFiles === 1 ? 'file' : 'files'})`,
  ];
  return tags.filter((tag) => tag !== false).join(' · ');
};

/** Runs `git`, turning a failure into a `Failure` for the summary instead of a throw. */
const tryGit = (args: string[], subject: string): Failure | undefined => {
  try {
    git(args);
    return undefined;
  } catch (error) {
    return { subject, message: error instanceof Error ? error.message : String(error) };
  }
};

const deleteBranch = (branch: string): Failure | undefined => {
  // `-D`: `-d` checks the branch against the current HEAD, not `main`.
  return tryGit(['branch', '-D', branch], `delete branch ${branch}`);
};

/** How many worktrees `git worktree prune` will remove: those whose directory is gone. */
const countPrunable = (): number => {
  return git(['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line === 'prunable' || line.startsWith('prunable ')).length;
};

const allEntries = listWorktrees().map(toEntry);
const entries = [
  ...allEntries.filter((entry) => entry.path === mainCheckoutPath),
  ...allEntries.filter((entry) => entry.path === currentPath && entry.path !== mainCheckoutPath),
  ...allEntries.filter((entry) => !entry.isProtected),
];

intro('Remove worktrees');

if (entries.every((entry) => entry.isProtected)) {
  outro('There is no worktree to remove.');
  process.exit(0);
}

const pickedPaths = await multiselect<string>({
  message: 'Which worktrees should be removed?',
  options: entries.map((entry) => ({
    value: entry.path,
    label: labelEntry(entry),
    hint: hintEntry(entry),
    disabled: entry.isProtected,
  })),
  required: false,
});

if (isCancel(pickedPaths) || pickedPaths.length === 0) {
  cancel('Nothing was removed.');
  process.exit(0);
}

const picked = entries.filter((entry) => pickedPaths.includes(entry.path));

log.message(
  picked.map((entry) => `${labelEntry(entry)}  ${styleText('dim', hintEntry(entry))}`).join('\n'),
);
const isConfirmed = await confirm({
  message: `Remove ${picked.length === 1 ? 'this worktree' : `these ${picked.length} worktrees`}?`,
  initialValue: false,
});

if (isCancel(isConfirmed) || !isConfirmed) {
  cancel('Nothing was removed.');
  process.exit(0);
}

const failures: Failure[] = [];
const removed: Entry[] = [];

for (const entry of picked) {
  // Two `--force`s: one overrides uncommitted changes, the second the lock.
  const failure = tryGit(
    ['worktree', 'remove', '--force', '--force', entry.path],
    `remove worktree ${entry.path}`,
  );
  if (failure === undefined) removed.push(entry);
  else failures.push(failure);
}

const deletedBranches: string[] = [];
const deleteBranches = (branches: string[]): void => {
  for (const branch of branches) {
    const failure = deleteBranch(branch);
    if (failure === undefined) deletedBranches.push(branch);
    else failures.push(failure);
  }
};

const removedBranches = removed.flatMap((entry) =>
  entry.branch === undefined ? [] : [{ branch: entry.branch, isMerged: entry.isMerged }],
);
deleteBranches(removedBranches.filter(({ isMerged }) => isMerged).map(({ branch }) => branch));

const unmergedBranches = removedBranches
  .filter(({ isMerged }) => !isMerged)
  .map(({ branch }) => branch);

if (unmergedBranches.length > 0) {
  const pickedBranches = await multiselect<string>({
    message: `These branches are not merged into ${MAIN_BRANCH}. Delete them anyway?`,
    options: unmergedBranches.map((branch) => ({ value: branch, label: branch })),
    initialValues: [],
    required: false,
  });
  // Cancelling keeps every unmerged branch, as picking none does.
  deleteBranches(isCancel(pickedBranches) ? [] : pickedBranches);
}

const prunableCount = countPrunable();
const pruneFailure = tryGit(['worktree', 'prune'], 'prune stale worktree entries');
if (pruneFailure !== undefined) failures.push(pruneFailure);

const keptBranches = unmergedBranches.filter((branch) => !deletedBranches.includes(branch));

if (removed.length > 0) {
  log.success(`Removed worktrees:\n${removed.map((entry) => entry.path).join('\n')}`);
}
if (deletedBranches.length > 0) log.success(`Deleted branches: ${deletedBranches.join(', ')}`);
if (keptBranches.length > 0) log.info(`Kept unmerged branches: ${keptBranches.join(', ')}`);
if (pruneFailure === undefined && prunableCount > 0) {
  log.success(
    `Pruned ${prunableCount} stale worktree ${prunableCount === 1 ? 'entry' : 'entries'}`,
  );
}
for (const failure of failures) log.error(`Could not ${failure.subject}:\n${failure.message}`);

if (failures.length > 0) {
  outro(styleText('red', `${failures.length} ${failures.length === 1 ? 'step' : 'steps'} failed.`));
  process.exit(1);
}
outro('Done.');
