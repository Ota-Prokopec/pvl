# `thesis/`

The LaTeX source of the bachelor's thesis about PVL (KIV, FAV, University of West Bohemia), written in Czech. It isn't a workspace package and has no `package.json`: [`apps/thesis-web`](../apps/thesis-web/AGENTS.md) builds and previews it. [ADR-0023](../docs/adr/0023-thesis-built-locally-from-one-latex-source-to-pdf-and-html.md) and [ADR-0024](../docs/adr/0024-thesis-site-shows-only-the-pdf.md) record why it's built this way.

## Entry point

**`main.tex`** is the graded PDF, typeset with the faculty's `fasthesis` class (`czech, bc, kiv, he, iso690numb, pdf`) by `pdflatex` + `biber` through `latexmk`. The class requires `pdflatex`. It loads `chapters/*.tex`, `abstract-cs.tex`, `abstract-en.tex`, `keywords.tex` (both keyword lists), `pvl.sty` (the macros and listings style) and `refs.bib`. A new chapter is `\input` from `main.tex`.

## Rules

- **`pvl.sty` macro names must not clash with `fasthesis`.** The class already defines `\code`, for example.
- **Code listings are real repo files**, included with `\lstinputlisting{../<path from the repo root>}` (paths are relative to this folder). Never paste code into a chapter, and don't use `minted`.
- **The build is strict.** `latexmkrc` stops on the first TeX error, and `-Werror` fails on any warning left after the last pass: an undefined reference or citation, a missing package, a missing listing source. Fix the cause instead of loosening either.

## Faculty scaffolding and the font

Only what the build needs is committed from the faculty template: `fasthesis.cls`, the KIV logos, backgrounds and assignment pages it references (`img/`), and the signed assignment `zadani.pdf`. The rest of the template stays in the gitignored `scaffolding/` folder: its manual, sample PDFs and `install/`, the **GT America** font, which is commercially licensed to ZČU and must never be committed or served.

To build the PDF, install the font once into your user TeX tree. The map file is loaded by the class, so copying the files is enough:

```bash
cp -R 'thesis/scaffolding/install/$TEXMFLOCAL/.' "$(kpsewhich -var-value TEXMFHOME)"
```

## Commands

From the root: `pnpm dev:thesis` rebuilds the PDF on every save and shows it live in the browser, and `pnpm build:thesis` makes the committed site. To build only the PDF, run `latexmk -Werror main.tex` here; it writes `build/main.pdf`.
