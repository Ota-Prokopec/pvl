/**
 * What both ways of starting Claude Code share: handing the terminal to a
 * command, and the VS Code workspace whose one task runs `claude` in the
 * window's terminal as soon as the workspace opens.
 */
import * as childProcess from 'node:child_process';
import { log } from '@clack/prompts';

type RunArgs = {
  command: string;
  args: string[];
  cwd?: string;
};

/** Hands the terminal to `command` and exits with its status. */
export const run = ({ command, args, cwd }: RunArgs): never => {
  const { error, status } = childProcess.spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (error !== undefined) {
    log.error(`Could not start ${command}: ${error.message}`);
    process.exit(1);
  }
  process.exit(status ?? 1);
};

type WorkspaceArgs = {
  /** The folder the workspace opens, as a path on the machine that runs it. */
  folderPath: string;
  claudeArgs: string[];
  env: Record<string, string | undefined>;
};

/** The workspace file's JSON: its one task runs `claude` with `claudeArgs` every time the workspace opens. */
export const createWorkspace = ({ folderPath, claudeArgs, env }: WorkspaceArgs): string => {
  const workspace = {
    folders: [{ path: folderPath }],
    tasks: {
      version: '2.0.0',
      tasks: [
        {
          label: 'Claude Code',
          type: 'process',
          command: 'claude',
          args: claudeArgs,
          options: { cwd: folderPath, env },
          runOptions: { runOn: 'folderOpen' },
          presentation: { reveal: 'always', focus: true, panel: 'dedicated' },
          problemMatcher: [],
        },
      ],
    },
  };
  return `${JSON.stringify(workspace, null, 2)}\n`;
};
