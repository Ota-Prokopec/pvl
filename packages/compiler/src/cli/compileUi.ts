// The default output of `pvl compile` (ADR-0051): a clack frame on stdout
// around the run's steps and compile progress, then every diagnostic on
// stderr and a closing summary. `--tty false` and `--json` print `report`'s
// plain output instead.
import * as path from 'node:path';
import * as timersPromises from 'node:timers/promises';
import { intro, log, outro, progress, type ProgressResult } from '@clack/prompts';
import type { CompilationOutput, CompilationProgress } from '../compilation/types.js';
import type { CompileFlags, RunCliOptions } from './types.js';

/** `count` followed by `noun`, plural unless it is one. */
const pluralize = (count: number, noun: string): string => {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
};

/**
 * The UI of one run: constructing it opens the frame, `onProgress` draws each
 * step, `finish` draws the diagnostics and closes the frame.
 *
 * ```ts
 * const ui = CompileUi.start({ json: false, tty: true }, { cwd, stdout, stderr }); // ┌  pvl compile
 * await ui?.onProgress({ phase: 'scanned', total: 12 }); // ◇  Scanned 12 files
 * ui?.finish(payload); // └  📁 Written to .pvl
 * ```
 */
export class CompileUi {
  private readonly options: RunCliOptions;
  private progressBar: ProgressResult | undefined;
  private fileCount = 0;

  private constructor(options: RunCliOptions) {
    this.options = options;
    intro('pvl compile', { output: options.stdout });
  }

  /**
   * The UI for a run with `flags`, or `undefined` when `--json` or
   * `--tty false` asks for the plain output.
   */
  public static start(
    flags: Pick<CompileFlags, 'json' | 'tty'>,
    options: RunCliOptions,
  ): CompileUi | undefined {
    return flags.json || !flags.tty ? undefined : new CompileUi(options);
  }

  /** Draws a step of the run; `runCompilation`'s `onProgress`. */
  public async onProgress(event: CompilationProgress): Promise<void> {
    const output = this.options.stdout;
    switch (event.phase) {
      case 'scanned': {
        log.step(`Scanned ${pluralize(event.total, 'file')}`, { output });
        return;
      }
      case 'compiling': {
        const percent = Math.round((event.done / event.total) * 100);
        const message = `Compiling ${event.done}/${event.total} (${percent}%) ${event.file}`;
        if (this.progressBar === undefined) {
          this.fileCount = event.total;
          // A 1 ms tick: the bar repaints at each yield below, not on a clock.
          this.progressBar = progress({ max: event.total, output, delay: 0 });
          this.progressBar.start(message);
        } else {
          this.progressBar.advance(1, message);
        }
        // The bar's tick was queued before this timer on the same 1 ms list,
        // so it paints `message` before this file compiles.
        await timersPromises.setTimeout(0);
        return;
      }
      case 'writing': {
        this.stopProgressBar();
      }
    }
  }

  /** Draws the run's diagnostics on stderr, then its summary, closing the frame. */
  public finish({ diagnostics, destination, written }: CompilationOutput): void {
    const { cwd, stdout, stderr } = this.options;
    // A run that compiled every file but then raised an error never reached `writing`.
    this.stopProgressBar();
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

  private stopProgressBar(): void {
    this.progressBar?.stop(`Compiled ${pluralize(this.fileCount, 'file')}`);
    this.progressBar = undefined;
  }
}
