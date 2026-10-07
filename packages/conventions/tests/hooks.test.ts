import { describe, expect, it } from 'vitest';
import { checkBashCommand } from '../src/hooks/checkBashCommand.ts';
import { checkCommitMessage } from '../src/hooks/checkCommitMessage.ts';
import { checkEditedPath } from '../src/hooks/checkEditedPath.ts';

const REPO = '/repo' as const;

type RunArgs = {
  branch?: string | undefined;
  branches?: Record<string, string>;
  files?: Record<string, string>;
};

/** The reasons `command` is denied, run from `/repo` checked out on `branch` (`feat/thing` by default). */
const check = (
  command: string,
  { branch = 'feat/thing', branches = {}, files = {} }: RunArgs = {},
): string[] => {
  return checkBashCommand({
    command,
    cwd: REPO,
    currentBranch: (directory): string | undefined => branches[directory] ?? branch,
    readFile: (path): string | undefined => files[path],
  });
};

describe('checkBashCommand', () => {
  it.each([
    'git status',
    'git commit -m "feat(schema): add pvl.enum()"',
    'git commit -am "fix: handle NaN"',
    'git push -u origin feat/thing',
    'git checkout -b chore/new-thing && git commit -m "chore: x"',
    'git branch -m chore/renamed && git push -u origin chore/renamed',
    'gh pr create --title "feat(schema): add enum" --body "Closes #4."',
    'gh issue comment 4 --body "Opened #5."',
    'pnpm lint && pnpm test',
  ])('allows `%s`', (command) => {
    expect(check(command)).toEqual([]);
  });

  it.each([
    'git commit --no-verify -m "fix: x"',
    'git commit -n -m "fix: x"',
    'git commit -anm "fix: x"',
    'LEFTHOOK=0 git commit -m "fix: x"',
    'LEFTHOOK_EXCLUDE=lint git commit -m "fix: x"',
    'export LEFTHOOK=0; git commit -m "fix: x"',
    'git -c core.hooksPath=/dev/null commit -m "fix: x"',
    'git config core.hooksPath /tmp/hooks',
  ])('denies skipping the pre-commit hook: `%s`', (command) => {
    expect(check(command)).toEqual([expect.stringContaining('Never skip the pre-commit hook')]);
  });

  it.each([
    ['git commit -m "fix: x"', { branch: 'main' }],
    ['git push', { branch: 'main' }],
    ['git push origin main', {}],
    ['git push origin HEAD:main', {}],
    ['git push origin feat/thing:refs/heads/main', {}],
    ['git checkout main && git commit -m "fix: x"', {}],
    ['git -C /other commit -m "fix: x"', { branches: { '/other': 'main' } }],
    ['cd /other && git commit -m "fix: x"', { branches: { '/other': 'main' } }],
  ])('denies committing or pushing to main: `%s`', (command, args: RunArgs) => {
    expect(check(command, args)).toEqual([
      expect.stringContaining('never commit on or push to `main`'),
    ]);
  });

  it.each([
    ['git commit -m "fix: x"', 'worktree-chore+agents'],
    ['git push -u origin issue/5-thing', 'issue/5-thing'],
    ['git commit -m "fix: x"', 'Feat/Thing'],
  ])('denies `%s` on the branch %s', (command, branch) => {
    expect(check(command, { branch })).toEqual([
      expect.stringContaining(`The branch \`${branch}\``),
    ]);
  });

  it('denies the branch a command switches to before committing', () => {
    expect(check('git checkout -b my-branch && git commit -m "fix: x"')).toEqual([
      expect.stringContaining('The branch `my-branch`'),
    ]);
  });

  it('denies merging a pull request', () => {
    expect(check('gh pr merge 12 --squash')).toEqual([
      expect.stringContaining('never merge one yourself'),
    ]);
  });

  it('allows closing an issue', () => {
    expect(check('gh issue close 4 --comment "Resolved by #12."')).toEqual([]);
  });

  it('denies a closing comment that mentions Claude', () => {
    expect(check('gh issue close 4 -c "Done with Claude Code"')).toEqual([
      expect.stringContaining('mentions Claude'),
    ]);
  });

  it.each([
    'gh pr create --title "Add enum" --body "Closes #4."',
    'gh issue create -t "CLAUDE(feat): add enum" -b "x"',
    'gh pr edit 5 --title=update',
  ])('denies a non-conventional title: `%s`', (command) => {
    expect(check(command)).toContainEqual(
      expect.stringContaining("doesn't follow `<type>(<scope>): <description>`"),
    );
  });

  it.each([
    'gh pr create --title "feat: add enum" --body "Closes #4.\n\nGenerated with Claude Code"',
    'gh pr comment 5 --body "CLAUDE: opened the PR"',
    'gh issue create --title "feat: x" --body "$(cat <<EOF\nWritten by Claude\nEOF\n)"',
    'gh pr create --title "feat: x" --body-file - <<EOF\nby claude\nEOF',
    'gh pr create --title "feat: x" --body-file body.md',
  ])('denies posting a Claude mention: `%s`', (command) => {
    expect(check(command, { files: { '/repo/body.md': 'Made by Claude.' } })).toContainEqual(
      expect.stringContaining('Nothing posted to GitHub mentions Claude'),
    );
  });

  it('reports every broken rule, not only the first', () => {
    expect(
      check('LEFTHOOK=0 git commit --no-verify -m "x" && gh pr merge 1', { branch: 'main' }),
    ).toHaveLength(3);
  });
});

const SKILLS_LOCK = JSON.stringify({ version: 1, skills: { tdd: {}, zod: {} } });

/** The reasons editing `path` is denied, run from `/repo` whose `skills-lock.json` is `lock` (`null`: missing). */
const checkEdit = (path: string, lock: string | null = SKILLS_LOCK): string[] => {
  return checkEditedPath({
    path,
    cwd: REPO,
    readFile: (file): string | undefined =>
      file === `${REPO}/skills-lock.json` ? (lock ?? undefined) : undefined,
  });
};

describe('checkEditedPath', () => {
  it.each([
    'packages/schema/src/pvl.ts',
    '/repo/AGENTS.md',
    '/repo/.claude/settings.json',
    '.agents/skills/prototype-code/SKILL.md',
    '/repo/.claude/skills/prototype-code/SKILL.md',
  ])('allows editing %s', (path) => {
    expect(checkEdit(path)).toEqual([]);
  });

  it.each(['.agents/skills/tdd/SKILL.md', '/repo/.claude/skills/zod/SKILL.md'])(
    'denies editing the installed skill file %s',
    (path) => {
      expect(checkEdit(path)).toEqual([
        expect.stringContaining('installed from an external source'),
      ]);
    },
  );

  it.each([null, 'not json'])('denies editing any skill when the lock file is %j', (lock) => {
    expect(checkEdit('.agents/skills/prototype-code/SKILL.md', lock)).toEqual([
      expect.stringContaining('installed from an external source'),
    ]);
  });

  it('denies writing to the agent memory', () => {
    expect(checkEdit('/home/me/.claude/projects/-repo/memory/MEMORY.md')).toEqual([
      expect.stringContaining('Persist knowledge in the repo'),
    ]);
  });
});

describe('checkCommitMessage', () => {
  it.each([
    'feat(schema): add pvl.enum()\n\nBody.',
    'chore: move the repo to TypeScript 6.0.3',
    'fix!: drop Node 22',
    '# comment line\ndocs(adr): record ADR-0023',
    "Merge branch 'main' into feat/thing",
    'Revert "feat: add enum"',
    'fixup! feat: add enum',
  ])('accepts %j', (message) => {
    expect(checkCommitMessage(message)).toBeUndefined();
  });

  it.each([
    'fix',
    'CLAUDE(feat): add enum',
    'feature: add enum',
    'feat(Schema): add enum',
    'feat:missing space',
    '',
  ])('rejects %j', (message) => {
    expect(checkCommitMessage(message)).toContain(
      "doesn't follow `<type>(<scope>): <description>`",
    );
  });
});
