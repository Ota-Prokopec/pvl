/**
 * Builds the thesis site into `site/`: the strict PDF build (`latexmk`,
 * configured by `thesis/latexmkrc`) run inside `thesis/`, since the chapters'
 * `\input` and `\lstinputlisting` paths are relative to it, then the PDF and
 * the page that shows it copied into `site/`. A failing build stops here.
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as url from 'node:url';

const thesisUrl = new URL('../../../thesis/', import.meta.url);
const siteUrl = new URL('../site/', import.meta.url);

fs.rmSync(siteUrl, { recursive: true, force: true });
fs.mkdirSync(siteUrl, { recursive: true });
childProcess.execFileSync('latexmk', ['-Werror', 'main.tex'], {
  cwd: url.fileURLToPath(thesisUrl),
  stdio: 'inherit',
});
fs.copyFileSync(new URL('build/main.pdf', thesisUrl), new URL('main.pdf', siteUrl));
fs.copyFileSync(new URL('../src/index.html', import.meta.url), new URL('index.html', siteUrl));
