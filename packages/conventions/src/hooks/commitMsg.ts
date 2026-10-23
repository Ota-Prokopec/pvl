/** lefthook `commit-msg` hook: rejects a commit whose subject `checkCommitMessage.ts` refuses. Takes the message file's path. */
import * as fs from 'node:fs';
import { checkCommitMessage } from './checkCommitMessage.ts';

const reason = checkCommitMessage(fs.readFileSync(process.argv[2] ?? '', 'utf8'));
if (reason !== undefined) {
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
}
