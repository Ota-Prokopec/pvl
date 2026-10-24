/** Claude Code `PreToolUse` hook on Edit, Write and NotebookEdit: denies an edit `checkEditedPath.ts` forbids. */
import { checkEditedPath } from './checkEditedPath.ts';
import { denyToolUse, readHookInput } from './hookIo.ts';

const input = readHookInput();
const editedPath = input.toolInput.file_path ?? input.toolInput.notebook_path;
if (typeof editedPath === 'string') {
  denyToolUse(checkEditedPath({ editedPath, cwd: input.cwd }));
}
