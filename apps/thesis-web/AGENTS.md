# `thesis-web`

The website of the bachelor's thesis in [`thesis/`](../../thesis/AGENTS.md): the thesis converted to HTML, one page per chapter, plus the graded PDF to download. It has no framework. [ADR-0023](../../docs/adr/0023-thesis-built-locally-from-one-latex-source-to-pdf-and-html.md) records why it's built this way.

## Built locally, committed, deployed by Vercel

`pnpm build:thesis` (`src/build.ts`) regenerates `site/`, the complete static site, and the author commits it. Nothing remote builds the thesis: building the PDF needs a TeX installation and the licensed GT America font, which exists only on the author's machine. Vercel's Git integration deploys the committed `site/` as is: production on a push to `main`, a preview on any other branch. [`vercel.json`](./vercel.json) skips the install step, runs no build (this package has no `build` script) and serves `site/`. Its `ignoreCommand` skips the deployment when the pushed commit doesn't touch this package.

So **`site/` is generated but tracked**. Never edit it by hand: change `thesis/` or `tex/`, then rerun `pnpm build:thesis`. A commit that changes `thesis/` without a rebuilt `site/` deploys nothing new.

`build:thesis` is its own Turborepo task, uncached because listings read arbitrary repo files. It isn't part of `build`, so `pnpm build`, the post-modification checklist and `ci.yml` never need TeX.

## The pieces

`src/build.ts` drives the build; `tex/` holds the tex4ht config, the make4ht build file and the stylesheet. Each file's top comment says what it does.

## No tests, by decision

A strict build is the test, as in [`apps/docs`](../docs/AGENTS.md). Every failure that matters (an undefined reference or citation, a missing package or listing source, `make4ht` exiting non-zero) stops `pnpm build:thesis`. There are no checks on the contents of `site/`.

## Setup for the deploy (repo owner, once)

Import the GitHub repo into a Vercel project, set its Root Directory to `apps/thesis-web` (so Vercel reads `vercel.json` from here) and keep `main` as the production branch. Tag each version submitted to the school.
