/**
 * `pnpm claude --codespace`: starts Claude Code in a GitHub Codespace of this
 * repo instead of a local worktree, for work too heavy for the local machine.
 * The menu lists the repo's codespaces by branch; the green last entry creates
 * one on `main` (4 cores, 16 GB) and switches it to a new `<type>/<slug>`
 * branch. Either way the script writes the workspace file inside the codespace
 * over `gh codespace ssh` and opens it in a new VS Code window, whose task
 * starts `claude` in the codespace's terminal.
 */
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import * as util from 'node:util';
import { cancel, isCancel, log, outro, select, text } from '@clack/prompts';
import { BRANCH_NAME } from '@repo/conventions/naming';
import { git } from '@repo/git-worktrees';
import { createWorkspace, run } from './launch.ts';

const CREATE_CODESPACE = Symbol('create-codespace');

/** The 4-core, 16 GB RAM machine; `.devcontainer/devcontainer.json` requires at least 4 cores too. */
const MACHINE = 'standardLinux32gb' as const;

type Codespace = {
  name: string;
  state: string;
  gitStatus: { ref: string };
};

/** Runs `gh` and returns its trimmed stdout; a failure throws with gh's stderr in the message. */
const gh = (args: string[], input?: string): string => {
  return childProcess
    .execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] })
    .trim();
};

const exitWith = (message: string, error: unknown): never => {
  log.error(`${message}:\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
};

const askForNewBranch = async (): Promise<string> => {
  const branch = await text({
    message: 'Branch of the new codespace',
    placeholder: 'e.g. refactor/enum-factory',
    validate: (value = '') => {
      const trimmed = value.trim();
      if (!BRANCH_NAME.test(trimmed)) return 'Use <type>/<slug>, e.g. feat/enum-factory.';
      if (git(['ls-remote', '--heads', 'origin', trimmed]) !== '') {
        return `The branch ${trimmed} already exists on origin.`;
      }
      return undefined;
    },
  });
  if (isCancel(branch)) {
    cancel('Claude Code was not started.');
    process.exit(0);
  }
  return branch.trim();
};

/** Creates a codespace on `main` and returns its name; the quota guardrails stop it after 30 idle minutes and delete it a week after that. */
const createCodespace = (repo: string): string => {
  log.step(`Creating a ${MACHINE} codespace of ${repo}; the first one builds the dev container`);
  try {
    return gh([
      'codespace',
      'create',
      '--repo',
      repo,
      '--branch',
      'main',
      '--machine',
      MACHINE,
      '--idle-timeout',
      '30m',
      '--retention-period',
      '168h',
      '--default-permissions',
    ]);
  } catch (error) {
    return exitWith('Could not create the codespace', error);
  }
};

export const startInCodespace = async (claudeArgs: string[]): Promise<never> => {
  let repo: string;
  let codespaces: Codespace[];
  try {
    repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
    codespaces = JSON.parse(
      gh(['codespace', 'list', '--repo', repo, '--json', 'name,state,gitStatus']),
    ) as Codespace[];
  } catch (error) {
    // Without the `codespace` scope, gh's own message says to run `gh auth refresh -h github.com -s codespace`.
    return exitWith('Could not list the codespaces', error);
  }

  const choice = await select<string | typeof CREATE_CODESPACE>({
    message: 'Which codespace should Claude Code work in?',
    options: [
      ...codespaces.map((codespace) => ({
        value: codespace.name,
        label: codespace.gitStatus.ref,
        hint: `${codespace.state} · ${codespace.name}`,
      })),
      {
        value: CREATE_CODESPACE,
        label: util.styleText('green', '+ Create a new codespace'),
        hint: `on a new branch off main · ${MACHINE}`,
      },
    ],
  });
  if (isCancel(choice)) {
    cancel('Claude Code was not started.');
    process.exit(0);
  }

  const newBranch = choice === CREATE_CODESPACE ? await askForNewBranch() : undefined;
  const name = choice === CREATE_CODESPACE ? createCodespace(repo) : choice;
  const branch =
    newBranch ?? codespaces.find((codespace) => codespace.name === name)?.gitStatus.ref ?? name;

  // Codespaces clone the repo into /workspaces/<repo name>.
  const folderPath = path.posix.join('/workspaces', repo.split('/')[1] ?? '');
  const workspaceFile = path.posix.join(
    folderPath,
    '.vscode',
    `${branch.replace('/', '+')}.code-workspace`,
  );
  const switchBranch =
    newBranch === undefined ? '' : `git -C ${folderPath} switch -c ${newBranch} && `;
  try {
    // ssh starts a stopped codespace; the branch name passed BRANCH_NAME, so it is safe in the shell.
    gh(
      [
        'codespace',
        'ssh',
        '--codespace',
        name,
        '--',
        `${switchBranch}mkdir -p ${path.posix.dirname(workspaceFile)} && cat > ${workspaceFile}`,
      ],
      createWorkspace({ folderPath, claudeArgs, env: {} }),
    );
  } catch (error) {
    return exitWith(`Could not prepare the codespace ${name}`, error);
  }

  outro(`Opening ${branch} in VS Code, where Claude Code starts in the codespace's terminal`);
  return run({
    command: 'code',
    args: ['--new-window', '--file-uri', `vscode-remote://codespaces+${name}${workspaceFile}`],
  });
};
