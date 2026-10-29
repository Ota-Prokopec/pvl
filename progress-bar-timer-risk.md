# Risk: a throw during compilation leaves the progress bar's timer running, so `pvl compile` never exits

Found while implementing #227 (commit `a97ff3b` on `feat/tty-ui`). Not fixed.

## What happens

In the default UI mode, `CompileUi` starts clack's `progress()` bar on the first `compiling` event. That bar runs a `setInterval` (a 1 ms tick) and registers `process` listeners (`SIGINT`, `SIGTERM`, `exit`, `unhandledRejection`, `uncaughtExceptionMonitor`). Only `progressBar.stop()` clears them, and only two paths call it: the `writing` event and `CompileUi.finish()`.

If `runCompilation` throws after the bar has started (a bug in an Emitter, `readSchema`, `compileAll` or the writer, anything not turned into a diagnostic), neither path runs:

1. `runCompile` (`packages/compiler/src/cli/runCompile.ts`) awaits `runCompilation` and never reaches `report(...)`, which would call `ui.finish(payload)`.
2. The rejection reaches yargs' `parseAsync(...).catch(...)` in `runCli` (`packages/compiler/src/cli/runCli.ts`). That catch already reports a handler error as `INVALID_ARGUMENTS`. It opens a **second** `CompileUi` frame and returns `1`.
3. `bin.ts` sets `process.exitCode = 1`, but the first bar's interval still holds the event loop open. **The process never exits**, and the abandoned bar keeps repainting.

## Reproduction

A script that does what `runCompile` does, then throws mid-loop:

```ts
// hang.mts — run with `npx tsx hang.mts` from packages/compiler
import { CompileUi } from './src/cli/compileUi.ts';

const ui = CompileUi.start(
  { json: false, tty: true },
  { cwd: '.', stdout: process.stdout, stderr: process.stderr },
);
const compile = async () => {
  await ui?.onProgress({ phase: 'scanned', total: 2 });
  await ui?.onProgress({ phase: 'compiling', file: 'a.ts', done: 0, total: 2 });
  throw new Error('bug inside runCompilation');
};
await compile().catch((error: Error) => console.error(`caught: ${error.message}`));
process.exitCode = 1;
```

Observed: `caught: bug inside runCompilation` is printed, and the process is still alive 4 s later.

## Impact

- Only the default UI mode is affected. `--tty false` and `--json` never start the bar, so they exit normally.
- It needs an internal bug to trigger it: `runCompilation` reports expected problems as diagnostics and isn't meant to throw. But when it does, a CI job hangs until its timeout instead of failing fast with exit `1`.
- The error is also mislabelled as `INVALID_ARGUMENTS`. That happened before #227 too.

## Suggested fix

Stop the bar whenever `runCompilation` doesn't return. For example, in `runCompile`:

```ts
const payload = await runCompilation({ ... }).catch((error: unknown) => {
  ui?.abort(); // stops the progress bar and clears clack's listeners
  throw error;
});
```

`CompileUi.abort()` would be a small public method calling `this.progressBar?.error(...)`. Add a CLI test that makes the run throw and asserts that `runCli` resolves and that no timer is left running (for example, the test process exits, or `vi.getTimerCount()` with fake timers).
