---
name: extend-docs-converter
description: Improves the Markdown-to-Google-Docs formatting in apps-script/Code.gs (headings, lists, tables, inline styles). Use when the Google Doc shows wrong heading levels, broken numbering, leaked formatting or bad tables.
---

# Extend the Markdown -> Docs converter

## Key rule
New paragraphs inherit formatting from the previous one in Google Docs. Every new paragraph or list item must go through `para()` / `listItem()`, which reset attributes explicitly.

## Steps
1. Reproduce with the smallest Markdown input that triggers the bug. Add it to `testAppend()` or a new `testCase_<name>()` function.
2. Fix in `appendMarkdown`, `addInline`, `listItem`, `para` or `addTable`, whichever owns the bug.
3. Do not enable Advanced Docs Service unless the user agrees.
4. Never write a literal triple backtick in the source; use a regex like /`{3}/.

## Done when
You explain the change in words and tell the user which function to run and what to look for in the Doc. You cannot see the Doc, so never claim the visual result is confirmed.
