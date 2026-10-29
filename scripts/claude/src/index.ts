/**
 * Starts Claude Code with `--dangerously-skip-permissions` in a git worktree
 * picked from a `@clack/prompts` menu. The worktree this runs from is listed
 * first, so it is preselected, and Claude Code starts in this terminal. Every
 * other worktree opens in a new VS Code window, and so does the new worktree
 * the green last entry creates, once `pnpm install` has run in it. The new
 * worktree is named after the `<type>/<slug>` branch the script asks for:
 * branch `refactor/enum-factory` goes to `.claude/worktrees/refactor+enum-factory/`.
 * A generated workspace file runs `claude` in that window's terminal as soon
 * as it opens. Claude Code starts with `TURBO_CACHE_DIR` set to the main
 * checkout's `.turbo/cache`, so every worktree reuses one turbo cache.
 * Arguments given to the script are forwarded to `claude`, so
 * `pnpm claude --continue` works. `--codespace` is the script's own flag: it
 * picks or creates a GitHub Codespace instead of a worktree (`codespace.ts`).
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as util from 'node:util';
import { cancel, intro, isCancel, log, outro, select, text } from '@clack/prompts';
import { BRANCH_NAME } from '@repo/conventions/naming';
import {
  getCurrentWorktreePath,
  getMainCheckoutPath,
  git,
  listWorktrees,
  type Worktree,
} from '@repo/git-worktrees';
import { startInCodespace } from './codespace.ts';
import { createWorkspace, run } from './launch.ts';

/** The menu value of the "create a new worktree" entry; no path can equal it. */
const CREATE_WORKTREE = Symbol('create-worktree');

/** New worktrees start from this branch as it is on `origin`. */
const MAIN_BRANCH = 'main' as const;

const CODESPACE_FLAG = '--codespace' as const;

const scriptArgs = process.argv.slice(2);
const claudeArgs = [
  '--dangerously-skip-permissions',
  ...scriptArgs.filter((arg) => arg !== CODESPACE_FLAG),
];

const describeError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * Writes the worktree's VS Code workspace file into its (gitignored) `.vscode/`
 * and returns the file's path. The workspace's one task runs `claude` with this
 * run's arguments in the window's terminal every time the workspace opens.
 */
const writeWorkspaceFile = (worktreePath: string): string => {
  const workspaceFile = path.join(
    worktreePath,
    '.vscode',
    `${path.basename(worktreePath)}.code-workspace`,
  );
  fs.mkdirSync(path.dirname(workspaceFile), { recursive: true });
  fs.writeFileSync(
    workspaceFile,
    createWorkspace({
      folderPath: worktreePath,
      claudeArgs,
      env: { TURBO_CACHE_DIR: process.env.TURBO_CACHE_DIR },
    }),
  );
  return workspaceFile;
};

const openInVSCode = (worktreePath: string): never => {
  const workspaceFile = writeWorkspaceFile(worktreePath);
  outro(
    `Opening ${path.basename(worktreePath)} in VS Code, where Claude Code starts in the terminal`,
  );
  return run({ command: 'code', args: ['--new-window', workspaceFile] });
};

const currentPath = getCurrentWorktreePath();
const mainCheckoutPath = getMainCheckoutPath();
const worktreesDirectory = path.join(mainCheckoutPath, '.claude', 'worktrees');

// Every checkout shares the main checkout's turbo cache; `cacheDir` in turbo.json can't, as it must be relative.
process.env.TURBO_CACHE_DIR ??= path.join(mainCheckoutPath, '.turbo', 'cache');

const labelWorktree = (worktree: Worktree): string => {
  const tags = [
    worktree.path === mainCheckoutPath && 'main checkout',
    worktree.path === currentPath && 'current',
  ];
  return [path.basename(worktree.path), ...tags.filter((tag) => tag !== false)].join(' · ');
};

const hintWorktree = (worktree: Worktree): string => {
  const where = worktree.path === currentPath ? 'in this terminal' : 'in a new VS Code window';
  return `${worktree.branch ?? 'detached HEAD'} · ${where}`;
};

const worktrees = listWorktrees();
const orderedWorktrees = [
  ...worktrees.filter((worktree) => worktree.path === currentPath),
  ...worktrees.filter((worktree) => worktree.path !== currentPath),
];

intro('Claude Code');

if (scriptArgs.includes(CODESPACE_FLAG)) await startInCodespace(claudeArgs);

const choice = await select<string | typeof CREATE_WORKTREE>({
  message: 'Which worktree should Claude Code work in?',
  options: [
    ...orderedWorktrees.map((worktree) => ({
      value: worktree.path,
      label: labelWorktree(worktree),
      hint: hintWorktree(worktree),
    })),
    {
      value: CREATE_WORKTREE,
      label: util.styleText('green', '+ Create a new worktree'),
      hint: 'under .claude/worktrees/ · in a new VS Code window',
    },
  ],
});

if (isCancel(choice)) {
  cancel('Claude Code was not started.');
  process.exit(0);
}

if (choice === currentPath) {
  outro(`Starting Claude Code in ${choice}`);
  run({ command: 'claude', args: claudeArgs, cwd: choice });
}

if (choice !== CREATE_WORKTREE) openInVSCode(choice);

/** The worktree's directory name: the branch's one `/` becomes `+`, so `refactor/x` → `refactor+x`. */
const nameWorktree = (branch: string): string => {
  return branch.replace('/', '+');
};

const branchInput = await text({
  message: 'Branch of the new worktree',
  placeholder: 'e.g. refactor/enum-factory',
  validate: (value = '') => {
    const trimmed = value.trim();
    if (!BRANCH_NAME.test(trimmed)) return 'Use <type>/<slug>, e.g. feat/enum-factory.';
    if (git(['branch', '--list', trimmed]) !== '') return `The branch ${trimmed} already exists.`;
    const name = nameWorktree(trimmed);
    if (fs.existsSync(path.join(worktreesDirectory, name))) return `${name} already exists.`;
    return undefined;
  },
});

if (isCancel(branchInput)) {
  cancel('Claude Code was not started.');
  process.exit(0);
}

const branch = branchInput.trim();
const worktreeName = nameWorktree(branch);
const worktreePath = path.join(worktreesDirectory, worktreeName);
const base = `origin/${MAIN_BRANCH}`;

log.step(`Creating ${worktreePath} from ${base}`);
try {
  git(['fetch', '--quiet', 'origin', MAIN_BRANCH]);
} catch (error) {
  log.warn(
    `Could not fetch ${MAIN_BRANCH}, so the last fetched ${base} is used:\n${describeError(error)}`,
  );
}
try {
  // The placement matches `claude --worktree`; the branch is ready to commit on, unlike its `worktree-<name>`.
  git(['worktree', 'add', '--no-track', '-b', branch, worktreePath, base]);
} catch (error) {
  log.error(`Could not create the worktree:\n${describeError(error)}`);
  process.exit(1);
}

log.step(`Installing dependencies in ${worktreeName}`);
const install = childProcess.spawnSync('pnpm', ['install'], {
  cwd: worktreePath,
  stdio: 'inherit',
});
// The worktree exists either way, so a failed install still opens it, where `pnpm install` can be rerun.
if (install.error !== undefined || install.status !== 0) {
  log.warn(`pnpm install failed in ${worktreePath}; run it there again.`);
}

openInVSCode(worktreePath);
