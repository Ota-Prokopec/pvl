/** Reading a Claude Code hook's input and answering it. */
import { readFileSync } from 'node:fs';

export type HookInput = {
  cwd: string;
  toolInput: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/** The hook's JSON input from stdin. */
export const readHookInput = (): HookInput => {
  const parsed: unknown = JSON.parse(readFileSync(0, 'utf8'));
  const input = isRecord(parsed) ? parsed : {};
  return {
    cwd: typeof input.cwd === 'string' ? input.cwd : process.cwd(),
    toolInput: isRecord(input.tool_input) ? input.tool_input : {},
  };
};

/** The UTF-8 contents of `path`, or `undefined` when it can't be read. */
export const readFile = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

/** Denies the tool call with every broken rule as the reason; does nothing when `reasons` is empty. */
export const denyToolUse = (reasons: string[]): void => {
  if (reasons.length === 0) {
    return;
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reasons.join('\n'),
      },
    }),
  );
};
