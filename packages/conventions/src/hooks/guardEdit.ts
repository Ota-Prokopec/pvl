/** Claude Code `PreToolUse` hook on Edit, Write and NotebookEdit: denies an edit `checkEditedPath.ts` forbids. */
import { checkEditedPath } from './checkEditedPath.ts';
import { denyToolUse, readHookInput } from './hookIo.ts';

const input = readHookInput();
const path = input.toolInput.file_path ?? input.toolInput.notebook_path;
if (typeof path === 'string') {
  denyToolUse(checkEditedPath(path, input.cwd));
}
