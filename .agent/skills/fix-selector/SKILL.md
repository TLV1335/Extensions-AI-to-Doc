---
name: fix-selector
description: Fixes the DOM selector that extracts the last AI reply in the AI-to-Google-Docs extension. Use when the toast says content was not found, or the extracted text is wrong (includes reasoning, grabs the user message, cut off).
---

# Fix selector

Selectors live in the `ADAPTERS` array in `extension/content.js`. AI sites change their DOM often, so this breaks periodically.

## Before editing
Ask the user for the outerHTML of the last AI message AND its parent container, plus the site name (Inspect > right-click element > Copy > Copy outerHTML). Do not guess class names. If the HTML is not provided, stop and ask.

## Steps
1. In the HTML, pick the most stable identifier, in this order: `data-*` attribute, `role` / `aria-*`, custom element tag name, semantic class. Avoid hashed or generated classes (`css-1x2y3z`, `_a1b2c`).
2. Edit only the matching entry in `ADAPTERS`. `last()` must return exactly one element: the final assistant message.
3. If the site puts reasoning/thinking in the same class as the answer, narrow the selector or filter by parent so reasoning is excluded.
4. If jsdom is available, check the selector against the HTML sample the user provided.

## Done when
The selector matches the sample HTML, and you have told the user to reload the extension and test on the real site (you cannot verify on the live site).
