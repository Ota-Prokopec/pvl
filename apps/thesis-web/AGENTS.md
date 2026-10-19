# `thesis-web`

The site of the bachelor's thesis in [`thesis/`](../../thesis/AGENTS.md): one page that shows the graded PDF. It has no framework and no HTML version of the thesis. [ADR-0023](../../docs/adr/0023-thesis-built-locally-from-one-latex-source-to-pdf-and-html.md) and [ADR-0024](../../docs/adr/0024-thesis-site-shows-only-the-pdf.md) record why it's built this way.

## Live preview

`pnpm dev:thesis` (from the root, or `pnpm dev` here) runs `latexmk -pvc` on `thesis/main.tex` and serves `src/index.html` plus the PDF with browser-sync, which reloads the browser each time the PDF is rewritten. It needs TeX and the font, like the build. A TeX error doesn't stop the watch: fix the source and save. The root `pnpm dev` skips it.

## Built locally, committed, deployed by Vercel

`pnpm build:thesis` (`src/build.ts`) regenerates `site/`, the complete static site (`index.html` and `main.pdf`), and the author commits it. Nothing remote builds the thesis: building the PDF needs a TeX installation and the licensed GT America font, which exists only on the author's machine. Vercel's Git integration deploys the committed `site/` as is: production on a push to `main`, a preview on any other branch. [`vercel.json`](./vercel.json) skips the install step, runs no build (this package has no `build` script) and serves `site/`. Its `ignoreCommand` skips the deployment when the pushed commit doesn't touch this package.

So **`site/` is generated but tracked**. Never edit it by hand: change `thesis/` or `src/index.html`, then rerun `pnpm build:thesis`. A commit that changes `thesis/` without a rebuilt `site/` deploys nothing new.

`build:thesis` is its own Turborepo task, uncached because listings read arbitrary repo files. It isn't part of `build`, so `pnpm build`, the post-modification checklist and `ci.yml` never need TeX.

## The pieces

`src/build.ts` builds the site, `src/dev.ts` runs the live preview, and `src/index.html` is the page that embeds the PDF. Each file's top comment says what it does.

## No tests, by decision

A strict build is the test, as in [`apps/docs`](../docs/AGENTS.md). Every failure that matters (an undefined reference or citation, a missing package or listing source) stops `pnpm build:thesis`. There are no checks on the contents of `site/`.

## Setup for the deploy (repo owner, once)

Import the GitHub repo into a Vercel project, set its Root Directory to `apps/thesis-web` (so Vercel reads `vercel.json` from here) and keep `main` as the production branch. Tag each version submitted to the school.
