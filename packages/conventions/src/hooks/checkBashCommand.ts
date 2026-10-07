/**
 * The git and GitHub rules from `docs/agents/git-workflow.md` that a Bash
 * command can break, checked before Claude Code runs it. Pure: the current
 * branch and file contents come in through `CheckBashCommandArgs`.
 */
import { resolve } from 'node:path';
import { parse } from 'shell-quote';
import { BRANCH_NAME, CONVENTIONAL_SUBJECT } from './naming.ts';

const MAIN_BRANCH = 'main' as const;
const SEPARATORS = new Set(['&&', '||', ';', '|', '&', '|&', '(', ')']);
const GH_POSTING_COMMANDS = new Set([
  'pr create',
  'pr edit',
  'pr comment',
  'pr review',
  'issue create',
  'issue edit',
  'issue comment',
  'issue close',
]);
const GH_TITLED_COMMANDS = new Set(['pr create', 'pr edit', 'issue create', 'issue edit']);

const SKIP_HOOK =
  'Never skip the pre-commit hook (no `--no-verify`/`-n`, `LEFTHOOK=0`, `LEFTHOOK_EXCLUDE` or `core.hooksPath` override). Fix what the hook reports and commit again.' as const;
const NOT_ON_MAIN =
  'All finished work lands through a pull request: never commit on or push to `main`. Create a `<type>/<slug>` branch first.' as const;
const NO_MERGE = 'The user merges every pull request; never merge one yourself.' as const;
const NO_CLAUDE =
  'Nothing posted to GitHub mentions Claude: no `CLAUDE` prefix and no "Generated with Claude Code" footer.' as const;

const badBranch = (branch: string): string => {
  return `The branch \`${branch}\` doesn't match \`<type>/<slug>\` (e.g. \`feat/enum-factory\`). Rename it with \`git branch -m <type>/<slug>\` before committing or pushing.`;
};

const badTitle = (title: string): string => {
  return `The title "${title}" doesn't follow \`<type>(<scope>): <description>\`, where \`<type>\` is feat, fix, docs, refactor, test or chore and the scope is optional.`;
};

/** The command split into its simple commands, each a list of words. */
const splitCommands = (command: string): string[][] => {
  const commands: string[][] = [[]];
  for (const token of parse(command, (name): string => `$${name}`)) {
    if (typeof token === 'string') {
      commands[commands.length - 1]?.push(token);
    } else if ('op' in token && SEPARATORS.has(token.op)) {
      commands.push([]);
    } else if ('op' in token && token.op === 'glob') {
      commands[commands.length - 1]?.push(token.pattern);
    }
  }
  return commands.filter((words): boolean => words.length > 0);
};

/** The values given to any of `flags`, as `--flag value` or `--flag=value`. */
const flagValues = (words: string[], flags: string[]): string[] => {
  return words.flatMap((word, index): string[] => {
    if (flags.includes(word)) {
      const value = words[index + 1];
      return value === undefined ? [] : [value];
    }
    const flag = flags.find((candidate): boolean => word.startsWith(`${candidate}=`));
    return flag === undefined ? [] : [word.slice(flag.length + 1)];
  });
};

const hasShortFlag = (words: string[], flag: string): boolean => {
  return words.some((word): boolean => /^-[a-zA-Z]+$/.test(word) && word.includes(flag));
};

const isHookSkip = (word: string): boolean => {
  return /^LEFTHOOK=(?:0|false)$/i.test(word) || word.startsWith('LEFTHOOK_EXCLUDE=');
};

type GitState = { directory: string; branch: string | undefined };

/** Splits `git [global options] <subcommand> <args>`, applying `-C` to `state` and reporting a `-c core.hooksPath` override. */
const parseGit = (
  words: string[],
  directory: string,
  reasons: Set<string>,
): { directory: string; subcommand: string | undefined; args: string[] } => {
  let index = 1;
  let target = directory;
  while (index < words.length && words[index]?.startsWith('-')) {
    const option = words[index];
    if (option === '-C') {
      target = resolve(target, words[index + 1] ?? '.');
      index += 2;
    } else if (option === '-c') {
      if (words[index + 1]?.toLowerCase().startsWith('core.hookspath')) {
        reasons.add(SKIP_HOOK);
      }
      index += 2;
    } else {
      index += 1;
    }
  }
  return { directory: target, subcommand: words[index], args: words.slice(index + 1) };
};

const checkBranch = (branch: string | undefined, reasons: Set<string>): void => {
  if (branch === MAIN_BRANCH) {
    reasons.add(NOT_ON_MAIN);
  } else if (branch !== undefined && !BRANCH_NAME.test(branch)) {
    reasons.add(badBranch(branch));
  }
};

const checkGit = (
  words: string[],
  state: GitState,
  args: CheckBashCommandArgs,
  reasons: Set<string>,
): GitState => {
  const git = parseGit(words, state.directory, reasons);
  const positional = git.args.filter((word): boolean => !word.startsWith('-'));
  const branch =
    git.directory === state.directory && state.branch !== undefined
      ? state.branch
      : args.currentBranch(git.directory);
  switch (git.subcommand) {
    case 'commit':
      if (git.args.includes('--no-verify') || hasShortFlag(git.args, 'n')) {
        reasons.add(SKIP_HOOK);
      }
      checkBranch(branch, reasons);
      return state;
    case 'push':
      if (
        positional
          .slice(1)
          .some((ref): boolean => ref === MAIN_BRANCH || /(?:^|:)(?:refs\/heads\/)?main$/.test(ref))
      ) {
        reasons.add(NOT_ON_MAIN);
      }
      checkBranch(branch, reasons);
      return state;
    case 'config':
      if (git.args.some((word): boolean => word.toLowerCase() === 'core.hookspath')) {
        reasons.add(SKIP_HOOK);
      }
      return state;
    case 'checkout':
    case 'switch': {
      const created = flagValues(git.args, [
        '-b',
        '-B',
        '-c',
        '-C',
        '--create',
        '--force-create',
      ])[0];
      const next = created ?? (git.args.includes('--') ? undefined : positional[0]);
      return next === undefined ? state : { directory: git.directory, branch: next };
    }
    case 'branch':
      if (git.args.includes('-m') || git.args.includes('-M') || git.args.includes('--move')) {
        const renamed = positional[positional.length - 1];
        return renamed === undefined ? state : { directory: git.directory, branch: renamed };
      }
      return state;
    default:
      return state;
  }
};

const checkGh = (
  words: string[],
  command: string,
  args: CheckBashCommandArgs,
  reasons: Set<string>,
): void => {
  const action = `${words[1] ?? ''} ${words[2] ?? ''}`;
  if (action === 'pr merge') {
    reasons.add(NO_MERGE);
  }
  if (GH_TITLED_COMMANDS.has(action)) {
    for (const title of flagValues(words, ['--title', '-t'])) {
      if (!CONVENTIONAL_SUBJECT.test(title)) {
        reasons.add(badTitle(title));
      }
    }
  }
  if (GH_POSTING_COMMANDS.has(action)) {
    const bodyFiles = flagValues(words, ['--body-file', '-F'])
      .filter((path): boolean => path !== '-')
      .map((path): string => args.readFile(resolve(args.cwd, path)) ?? '');
    // `gh issue close` posts its closing comment through `--comment`/`-c`.
    const textFlags =
      action === 'issue close' ? ['--comment', '-c'] : ['--title', '-t', '--body', '-b'];
    const posted = [...flagValues(words, textFlags), ...bodyFiles];
    // A heredoc fed to stdin never reaches the words, so the raw command stands in for it.
    if (command.includes('<<')) {
      posted.push(command);
    }
    if (posted.some((text): boolean => /claude/i.test(text))) {
      reasons.add(NO_CLAUDE);
    }
  }
};

export type CheckBashCommandArgs = {
  command: string;
  /** The directory the command starts in. */
  cwd: string;
  /** The branch checked out in `directory`, or `undefined` on a detached HEAD or outside a repository. */
  currentBranch: (directory: string) => string | undefined;
  /** The content of the file at `path`, or `undefined` when it can't be read. */
  readFile: (path: string) => string | undefined;
};

/** Every rule `command` breaks, each as the instruction to follow; empty when it may run. */
export const checkBashCommand = (args: CheckBashCommandArgs): string[] => {
  const reasons = new Set<string>();
  let state: GitState = { directory: args.cwd, branch: undefined };
  for (const words of splitCommands(args.command)) {
    if (words.some(isHookSkip)) {
      reasons.add(SKIP_HOOK);
    }
    const commandWords = words.slice(
      words.findIndex((word): boolean => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)),
    );
    const [program] = commandWords;
    if (program === 'cd') {
      state = { directory: resolve(state.directory, commandWords[1] ?? '.'), branch: undefined };
    } else if (program === 'git') {
      state = checkGit(commandWords, state, args, reasons);
    } else if (program === 'gh') {
      checkGh(commandWords, args.command, args, reasons);
    }
  }
  return [...reasons];
};
