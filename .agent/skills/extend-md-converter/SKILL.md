---
name: extend-md-converter
description: Improves the HTML-to-Markdown conversion (md() and toMarkdown()) in the extension's content.js. Use when lists, tables, links, code blocks or other formatting come out wrong before reaching Apps Script.
---

# Extend the HTML -> Markdown converter

## Steps
1. Write test cases first: HTML input and expected Markdown output. Run them in Node with jsdom (no browser needed).
2. Edit the relevant `case` in the `switch` inside `md()` in `extension/content.js`.
3. Re-run all earlier test cases to make sure nothing else broke.
4. Keep the signatures `md(node, depth)` and `toMarkdown(node)`.
5. Never write a literal triple backtick in the source. Use the existing `FENCE` constant, so generated `.md` docs do not break.

## Known limits
Math (KaTeX/MathJax) is skipped. If adding it, read `<annotation encoding="application/x-tex">` and send `$...$` as plain text, and tell the user Google Docs will not render LaTeX.

## Done when
New and old tests pass, and you report the (HTML in, Markdown out) pairs you actually verified.
