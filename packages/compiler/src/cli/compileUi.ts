// The default output of `pvl compile` (ADR-0051): a clack frame on stdout
// around a line per phase of the run, then every diagnostic on stderr and a
// closing summary. `--tty false` and `--json` print `report`'s plain output
// instead.
import { intro, log, outro } from '@clack/prompts';
import { pluralize } from '@repo/utils';
import * as path from 'node:path';
import type { CompilationOutput } from '../compilation/types.js';
import type { CliOptions, CompilationProgress, CompileFlags } from './types.js';

/**
 * The UI of one run: constructing it opens the frame, `onProgress` draws each
 * phase, `finish` draws the diagnostics and closes the frame.
 *
 * ```ts
 * const ui = CompileUi.start({ json: false, tty: true }, { cwd, stdout, stderr }); // ┌  pvl compile
 * ui?.onProgress('scanning'); // ◇  Scanning
 * ui?.finish(payload); // └  📁 Written to .pvl
 * ```
 */
export class CompileUi {
  private readonly cliOptions: CliOptions;

  private constructor(options: CliOptions) {
    this.cliOptions = options;
    intro('pvl compile', { output: options.stdout });
  }

  /**
   * The UI for a run with `flags`, or `undefined` when `--json` or
   * `--tty false` asks for the plain output.
   */
  public static start(
    flags: Pick<CompileFlags, 'json' | 'tty'>,
    options: CliOptions,
  ): CompileUi | undefined {
    return flags.json || !flags.tty ? undefined : new CompileUi(options);
  }

  /** Draws the phase the run is entering. */
  public onProgress(phase: CompilationProgress): void {
    // `scanning` draws `Scanning`.
    log.step(phase.charAt(0).toUpperCase() + phase.slice(1), { output: this.cliOptions.stdout });
  }

  /** Draws the run's diagnostics on stderr, then its summary, closing the frame. */
  public finish({ diagnostics, destination, written }: CompilationOutput): void {
    const { cwd, stdout, stderr } = this.cliOptions;
    const errors = diagnostics.filter((diagnostic) => diagnostic.isError()).length;
    const warnings = diagnostics.length - errors;
    for (const diagnostic of diagnostics) {
      const draw = diagnostic.isError() ? log.error : log.warn;
      draw(diagnostic.toString().trimEnd(), { output: stderr });
    }
    if (written && destination !== undefined) {
      const warned = warnings > 0 ? `  (⚠️ ${pluralize(warnings, 'warning')})` : '';
      outro(`📁 Written to ${path.relative(cwd, destination) || '.'}${warned}`, { output: stdout });
      return;
    }
    outro(`❌ ${pluralize(errors, 'error')}, ${pluralize(warnings, 'warning')}. Nothing written`, {
      output: stdout,
    });
  }
}
