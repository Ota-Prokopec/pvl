/**
 * Live preview of the thesis: `latexmk -pvc` rebuilds the PDF whenever a source
 * file changes, and browser-sync serves the page that shows it and reloads the
 * browser each time the PDF is rewritten. A TeX error doesn't stop the watch,
 * so fix the source and save again.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import browserSync from 'browser-sync';

const thesisDir = fileURLToPath(new URL('../../../thesis/', import.meta.url));
const pageDir = fileURLToPath(new URL('.', import.meta.url));
const pdfDir = fileURLToPath(new URL('../../../thesis/build/', import.meta.url));

const latexmk = spawn('latexmk', ['-pvc', '-view=none', '-Werror', 'main.tex'], {
  cwd: thesisDir,
  stdio: 'inherit',
});
latexmk.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGINT', () => latexmk.kill('SIGINT'));
process.on('SIGTERM', () => latexmk.kill('SIGTERM'));

browserSync.create().init({
  server: [pageDir, pdfDir],
  files: [`${pdfDir}main.pdf`],
  ui: false,
  notify: false,
  ghostMode: false,
});
