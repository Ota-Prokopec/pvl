/**
 * Builds the thesis site into `site/`: the strict PDF build (`latexmk`,
 * configured by `thesis/latexmkrc`) run inside `thesis/`, since the chapters'
 * `\input` and `\lstinputlisting` paths are relative to it, then the PDF and
 * the page that shows it copied into `site/`. A failing build stops here.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const thesisUrl = new URL('../../../thesis/', import.meta.url);
const siteUrl = new URL('../site/', import.meta.url);

rmSync(siteUrl, { recursive: true, force: true });
mkdirSync(siteUrl, { recursive: true });
execFileSync('latexmk', ['-Werror', 'main.tex'], {
  cwd: fileURLToPath(thesisUrl),
  stdio: 'inherit',
});
copyFileSync(new URL('build/main.pdf', thesisUrl), new URL('main.pdf', siteUrl));
copyFileSync(new URL('../src/index.html', import.meta.url), new URL('index.html', siteUrl));
