/**
 * Builds the thesis website into `site/`: the strict PDF build (`latexmk`,
 * configured by `thesis/latexmkrc`), then `make4ht` on `thesis/web.tex`, then
 * the site stylesheet and the PDF copied next to the pages. Both TeX tools run
 * inside `thesis/`, since the chapters' `\input` and `\lstinputlisting` paths
 * are relative to it. Any tool exiting non-zero stops the build.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const thesisUrl = new URL('../../../thesis/', import.meta.url);
const siteUrl = new URL('../site/', import.meta.url);
const texUrl = new URL('../tex/', import.meta.url);
const thesisDir = fileURLToPath(thesisUrl);
const siteDir = fileURLToPath(siteUrl);

const run = (command: string, args: readonly string[]): void => {
  execFileSync(command, args, { cwd: thesisDir, stdio: 'inherit' });
};

rmSync(siteDir, { recursive: true, force: true });
run('latexmk', ['-Werror', 'main.tex']);
run('make4ht', [
  '--lua',
  '--jobname',
  'index',
  '--config',
  fileURLToPath(new URL('thesis.cfg', texUrl)),
  '--build-file',
  fileURLToPath(new URL('build.mk4', texUrl)),
  '--build-dir',
  'build/web',
  '--output-dir',
  siteDir,
  'web.tex',
]);
copyFileSync(new URL('site.css', texUrl), new URL('site.css', siteUrl));
copyFileSync(new URL('build/main.pdf', thesisUrl), new URL('pvl-thesis.pdf', siteUrl));
