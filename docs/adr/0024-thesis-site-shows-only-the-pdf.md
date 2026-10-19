# The thesis site shows only the PDF, and `pnpm dev:thesis` previews it live

This supersedes the HTML half of [ADR-0023](./0023-thesis-built-locally-from-one-latex-source-to-pdf-and-html.md). The thesis is graded as the `fasthesis` PDF, and nobody needed the HTML version: keeping it meant a second entry point (`web.tex`), a `make4ht` pipeline with its own config and stylesheet, and a constraint on every chapter (only constructs tex4ht converts). All of that is removed. `apps/thesis-web` is now one page that embeds `main.pdf`, built by `latexmk -Werror` and committed under `site/` as before. The rest of ADR-0023 stands: the strict build, building locally because of the licensed font, and committed output deployed by Vercel.

**`pnpm dev:thesis` is the writing loop.** `latexmk -pvc` recompiles on every save, and browser-sync (off the shelf, rather than a hand-written server) serves the page and reloads the browser when the PDF changes. It stays out of the root `pnpm dev`, which must not need TeX.

Rejected alternative: keeping the HTML as an optional extra. It would keep the `\input`-only-convertible-constructs constraint on the chapters for a version nobody reads.
