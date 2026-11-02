// The default output of `pvl compile` (ADR-0051): a clack frame on stdout
// around a line per phase of the run, each diagnostic `report` hands it on
// stderr, and a closing summary. `--tty false` and `--json` skip it.
import { intro, log, outro } from '@clack/prompts';
import { pluralize } from '@repo/utils';
import * as path from 'node:path';
import type { CliOptions, CompileFlags } from '../cli/types.js';
import type { CompilationOutput } from '../compilation/types.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import type { CompilationProgress } from './types.js';

/**
 * The UI of one run: constructing it opens the frame, `onProgress` draws each
 * phase, `drawDiagnostic` draws one diagnostic, `finish` closes the frame.
 *
 * ```ts
 * const ui = CompileUi.start({ json: false, tty: true }, { cwd, stdout, stderr }); // ┌  pvl compile
 * ui?.onProgress('scanning'); // ◇  Scanning
 * ui?.drawDiagnostic(diagnostic); // ■  error PARSE_FAILED: …
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

  /** Draws `diagnostic` on stderr, red for an error and yellow for a warning. */
  public drawDiagnostic(diagnostic: Diagnostic): void {
    const draw = diagnostic.isError() ? log.error : log.warn;
    draw(diagnostic.toString().trimEnd(), { output: this.cliOptions.stderr });
  }

  /** Draws the run's summary, closing the frame. */
  public finish({ diagnostics, destination, written }: CompilationOutput): void {
    const { cwd, stdout } = this.cliOptions;
    const errors = diagnostics.filter((diagnostic) => diagnostic.isError()).length;
    const warnings = diagnostics.length - errors;
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
