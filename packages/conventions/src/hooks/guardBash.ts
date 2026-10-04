/** Claude Code `PreToolUse` hook on Bash: denies a command that breaks a git or GitHub rule (`checkBashCommand.ts`). */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkBashCommand } from './checkBashCommand.ts';
import { denyToolUse, readHookInput } from './hookIo.ts';

const currentBranch = (directory: string): string | undefined => {
  try {
    const branch = execFileSync('git', ['-C', directory, 'symbolic-ref', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return branch === '' ? undefined : branch;
  } catch {
    return undefined;
  }
};

const readFile = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

const input = readHookInput();
const command = input.toolInput.command;
if (typeof command === 'string') {
  denyToolUse(checkBashCommand({ command, cwd: input.cwd, currentBranch, readFile }));
}
