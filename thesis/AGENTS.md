# `thesis/`

The LaTeX source of the bachelor's thesis about PVL (KIV, FAV, University of West Bohemia), written in Czech. It isn't a workspace package and has no `package.json`: [`apps/thesis-web`](../apps/thesis-web/AGENTS.md) builds it. [ADR-0023](../docs/adr/0023-thesis-built-locally-from-one-latex-source-to-pdf-and-html.md) records why it's built this way.

## One source, two entry points

- **`main.tex`** is the graded PDF, typeset with the faculty's `fasthesis` class (`czech, bc, kiv, he, iso690numb, pdf`) by `pdflatex` + `biber` through `latexmk`. The class requires `pdflatex`.
- **`web.tex`** is the website, converted to HTML by `make4ht` in LuaLaTeX mode (pdfTeX mode garbles diacritics in page titles). It loads the standard `report` class with the same `babel`, `biblatex` (`iso-numeric`) and `listings` setup. The `fasthesis` frame (title page, backgrounds, declaration, assignment) exists only in the PDF.

Both load `chapters/*.tex`, `abstract-cs.tex`, `abstract-en.tex`, `keywords.tex` (both keyword lists), `pvl.sty` (the shared macros and listings style) and `refs.bib`, verbatim. A new chapter is `\input` from both entry points.

## Rules

- **Chapters stay convertible.** Use only constructs tex4ht turns into HTML: no `tikz` or `tcolorbox` unless a `pnpm build:thesis` run confirms it converts. A `fasthesis`-only macro (`\term`, `\filename`) breaks `web.tex`, so define what the chapters need in `pvl.sty` (`\enquote` from `csquotes` covers Czech quotes in both).
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

The build runs from the root: `pnpm build:thesis`. To build only the PDF while writing, run `latexmk -Werror main.tex` here; it writes `build/main.pdf`.
