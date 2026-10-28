/** The shell tokens and `gh` subcommands `checkBashCommand` splits and reads a Bash command by. */

/** The shell tokens that end one command and start the next. */
export const SEPARATORS = new Set(['&&', '||', ';', '|', '&', '|&', '(', ')']);

/** The `gh` subcommands that post to GitHub. */
export const GH_POSTING_COMMANDS = new Set([
  'pr create',
  'pr edit',
  'pr comment',
  'pr review',
  'issue create',
  'issue edit',
  'issue comment',
  'issue close',
]);

/** The `gh` subcommands that set a pull request's or an issue's title. */
export const GH_TITLED_COMMANDS = new Set(['pr create', 'pr edit', 'issue create', 'issue edit']);
