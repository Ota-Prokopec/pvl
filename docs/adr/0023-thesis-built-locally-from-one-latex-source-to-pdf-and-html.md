# The thesis is one LaTeX source built locally into a PDF and a committed website

The bachelor's thesis about PVL lives in this repo: the LaTeX source in a top-level [`thesis/`](../../thesis/AGENTS.md) folder outside the pnpm workspace, and its website in the private package [`apps/thesis-web`](../../apps/thesis-web/AGENTS.md). The faculty requires its `fasthesis` class for the graded PDF, and the website must always match the latest text.

**One source, two entry points.** The chapters, abstracts, macros (`pvl.sty`) and bibliography are shared verbatim. `main.tex` wraps them in `fasthesis` for the PDF (`pdflatex` + `biber` via `latexmk`). `web.tex` wraps them in the standard `report` class with the same language, bibliography and listings setup, and `make4ht` converts it to HTML. `fasthesis` itself doesn't convert, since it's built on `memoir` with a `pdflatex`-only frame. The cost is a constraint on the chapters: no construct tex4ht can't convert, and no `fasthesis`-only macro.

**The build is strict and is the only test.** `latexmk -Werror` turns an undefined reference or citation, a missing package or a missing `\lstinputlisting` source into a failed build, so no PDF ships with "??" in it. Listings include real repo files, so the thesis can't drift from the code it quotes.

**Built locally and committed, not built remotely.** The faculty's heading font, GT America, is commercially licensed to the university, so it stays out of the public repo (`thesis/scaffolding/` is gitignored). The first plan was to store it zipped and base64-encoded in a GitHub Actions secret, but a secret holds at most 48 KB, and the two weights the class needs come to about 354 KB encoded. So the author runs `pnpm build:thesis` with the font installed locally and commits the generated `apps/thesis-web/site/`. Vercel's Git integration deploys that folder as is, configured by [`apps/thesis-web/vercel.json`](../../apps/thesis-web/vercel.json): no install, no build, production on every push to `main` that touches the package. There is no GitHub Actions workflow for the thesis: with nothing to build, a workflow would only re-implement the upload Vercel already does, and it would need a Vercel token as a secret. Committed output can go stale against its source, and that is accepted: only the author changes the thesis.

**Outside `pnpm build`.** `build:thesis` is its own uncached Turborepo task, so `pnpm build`, the post-modification checklist and `ci.yml` never require TeX.

Rejected alternatives:

- **Splitting the font across several secrets.** It works around the size limit but is brittle to maintain.
- **Committing an encrypted font archive.** It keeps licensed material, encrypted, in a public repo.
- **A free font in CI.** The published PDF would then differ from the graded one.
- **A web framework (Astro, VitePress) around the HTML.** It adds a build step for what is already a complete static site.
