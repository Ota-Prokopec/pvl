/**
 * Starts Claude Code with `--dangerously-skip-permissions` in a git worktree
 * picked from a `@clack/prompts` menu. The worktree this runs from is listed
 * first, so it is preselected; every other worktree follows; the green last
 * entry has Claude Code create a new worktree itself (`claude --worktree`,
 * which places it under `.claude/worktrees/`). Arguments given to the script
 * are forwarded to `claude`, so `pnpm claude --continue` works.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { styleText } from 'node:util';
import { cancel, intro, isCancel, log, outro, select, text } from '@clack/prompts';

/** The menu value of the "create a new worktree" entry; no path can equal it. */
const CREATE_WORKTREE = Symbol('create-worktree');

type Worktree = {
  path: string;
  /** The checked-out branch, or `undefined` on a detached HEAD. */
  branch: string | undefined;
};

type LaunchClaudeArgs = {
  cwd: string;
  /** Arguments appended after the forwarded ones. */
  args: string[];
};

const git = (args: string[]): string => {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
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

/** Every worktree Claude Code can run in: a bare repository has no files, and a `prunable` worktree's directory is gone. */
const listWorktrees = (): Worktree[] => {
  return git(['worktree', 'list', '--porcelain'])
    .split('\n\n')
    .map(parseWorktreeBlock)
    .flatMap((attributes): Worktree[] => {
      const path = attributes.get('worktree');
      if (path === undefined || attributes.has('bare') || attributes.has('prunable')) return [];
      return [
        {
          path: realpathSync(path),
          branch: attributes.get('branch')?.replace(/^refs\/heads\//, ''),
        },
      ];
    });
};

/**
 * Hands the terminal to `claude` and exits with its status. The extra `args` go
 * last because `--worktree`'s name is optional: a forwarded prompt placed after
 * a bare `--worktree` would be taken as the name.
 */
const launchClaude = ({ cwd, args }: LaunchClaudeArgs): never => {
  const { error, status } = spawnSync(
    'claude',
    ['--dangerously-skip-permissions', ...process.argv.slice(2), ...args],
    {
      cwd,
      stdio: 'inherit',
    },
  );
  if (error !== undefined) {
    log.error(`Could not start claude: ${error.message}`);
    process.exit(1);
  }
  process.exit(status ?? 1);
};

const currentPath = realpathSync(git(['rev-parse', '--show-toplevel']));
// The common git dir is the main checkout's `.git`, whichever worktree this runs in.
const mainCheckoutPath = dirname(
  realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir'])),
);

const labelWorktree = (worktree: Worktree): string => {
  const tags = [
    worktree.path === mainCheckoutPath && 'main checkout',
    worktree.path === currentPath && 'current',
  ];
  return [basename(worktree.path), ...tags.filter((tag) => tag !== false)].join(' · ');
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
      hint: worktree.branch ?? 'detached HEAD',
    })),
    {
      value: CREATE_WORKTREE,
      label: styleText('green', '+ Create a new worktree'),
      hint: 'under .claude/worktrees/',
    },
  ],
});

if (isCancel(choice)) {
  cancel('Claude Code was not started.');
  process.exit(0);
}

if (choice !== CREATE_WORKTREE) {
  outro(`Starting Claude Code in ${choice}`);
  launchClaude({ cwd: choice, args: [] });
}

const name = await text({
  message: 'Name of the new worktree',
  placeholder: 'leave empty for a generated name',
  defaultValue: '',
});

if (isCancel(name)) {
  cancel('Claude Code was not started.');
  process.exit(0);
}

outro('Starting Claude Code in a new worktree');
// Run from the main checkout so the worktree lands in its `.claude/worktrees/`, not nested inside the current one.
launchClaude({
  cwd: mainCheckoutPath,
  args: name.trim() === '' ? ['--worktree'] : ['--worktree', name.trim()],
});
