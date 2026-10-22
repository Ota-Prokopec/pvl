/**
 * Starts Claude Code with `--dangerously-skip-permissions` in a git worktree
 * picked from a `@clack/prompts` menu. The worktree this runs from is listed
 * first, so it is preselected, and Claude Code starts in this terminal. Every
 * other worktree opens in a new VS Code window, and so does the new worktree
 * the green last entry creates under `.claude/worktrees/`, once `pnpm install`
 * has run in it. A generated
 * workspace file runs `claude` in that window's terminal as soon as it opens.
 * Arguments given to the script are forwarded to `claude`, so
 * `pnpm claude --continue` works.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { styleText } from 'node:util';
import { cancel, intro, isCancel, log, outro, select, text } from '@clack/prompts';
import {
  getCurrentWorktreePath,
  getMainCheckoutPath,
  git,
  listWorktrees,
  type Worktree,
} from '@repo/git-worktrees';

/** The menu value of the "create a new worktree" entry; no path can equal it. */
const CREATE_WORKTREE = Symbol('create-worktree');

/** New worktrees start from this branch as it is on `origin`. */
const MAIN_BRANCH = 'main' as const;

const claudeArgs = ['--dangerously-skip-permissions', ...process.argv.slice(2)];

type RunArgs = {
  command: string;
  args: string[];
  cwd?: string;
};

/** Hands the terminal to `command` and exits with its status. */
const run = ({ command, args, cwd }: RunArgs): never => {
  const { error, status } = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (error !== undefined) {
    log.error(`Could not start ${command}: ${error.message}`);
    process.exit(1);
  }
  process.exit(status ?? 1);
};

const describeError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * Writes the worktree's VS Code workspace file into its (gitignored) `.vscode/`
 * and returns the file's path. The workspace's one task runs `claude` with this
 * run's arguments in the window's terminal every time the workspace opens.
 */
const writeWorkspaceFile = (worktreePath: string): string => {
  const workspaceFile = join(worktreePath, '.vscode', `${basename(worktreePath)}.code-workspace`);
  const workspace = {
    folders: [{ path: worktreePath }],
    tasks: {
      version: '2.0.0',
      tasks: [
        {
          label: 'Claude Code',
          type: 'process',
          command: 'claude',
          args: claudeArgs,
          options: { cwd: worktreePath },
          runOptions: { runOn: 'folderOpen' },
          presentation: { reveal: 'always', focus: true, panel: 'dedicated' },
          problemMatcher: [],
        },
      ],
    },
  };
  mkdirSync(dirname(workspaceFile), { recursive: true });
  writeFileSync(workspaceFile, `${JSON.stringify(workspace, null, 2)}\n`);
  return workspaceFile;
};

const openInVSCode = (worktreePath: string): never => {
  const workspaceFile = writeWorkspaceFile(worktreePath);
  outro(`Opening ${basename(worktreePath)} in VS Code, where Claude Code starts in the terminal`);
  return run({ command: 'code', args: ['--new-window', workspaceFile] });
};

const currentPath = getCurrentWorktreePath();
const mainCheckoutPath = getMainCheckoutPath();
const worktreesDirectory = join(mainCheckoutPath, '.claude', 'worktrees');

const labelWorktree = (worktree: Worktree): string => {
  const tags = [
    worktree.path === mainCheckoutPath && 'main checkout',
    worktree.path === currentPath && 'current',
  ];
  return [basename(worktree.path), ...tags.filter((tag) => tag !== false)].join(' · ');
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
      label: styleText('green', '+ Create a new worktree'),
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

const name = await text({
  message: 'Name of the new worktree',
  placeholder: 'e.g. enum-factory',
  validate: (value = '') => {
    const trimmed = value.trim();
    if (!/^[\w.-]+$/.test(trimmed)) return 'Use letters, digits, ".", "_" and "-" only.';
    if (existsSync(join(worktreesDirectory, trimmed))) return `${trimmed} already exists.`;
    return undefined;
  },
});

if (isCancel(name)) {
  cancel('Claude Code was not started.');
  process.exit(0);
}

const worktreeName = name.trim();
const worktreePath = join(worktreesDirectory, worktreeName);
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
  // The `worktree-<name>` branch and the placement match `claude --worktree`.
  git(['worktree', 'add', '--no-track', '-b', `worktree-${worktreeName}`, worktreePath, base]);
} catch (error) {
  log.error(`Could not create the worktree:\n${describeError(error)}`);
  process.exit(1);
}

log.step(`Installing dependencies in ${worktreeName}`);
const install = spawnSync('pnpm', ['install'], { cwd: worktreePath, stdio: 'inherit' });
// The worktree exists either way, so a failed install still opens it, where `pnpm install` can be rerun.
if (install.error !== undefined || install.status !== 0) {
  log.warn(`pnpm install failed in ${worktreePath}; run it there again.`);
}

openInVSCode(worktreePath);
