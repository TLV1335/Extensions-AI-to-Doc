---
name: add-site-adapter
description: Adds support for a new AI chat site (e.g. Perplexity, Copilot, Grok) to the AI-to-Google-Docs extension. Use when the user wants the shortcut to work on another site.
---

# Add site adapter

## Steps
1. Ask the user for the outerHTML of one AI message and its container on the new site, and the site's hostname.
2. Add an object to `ADAPTERS` in `extension/content.js`: `{ host, name, last }`, where `last()` returns the final assistant message element.
3. Add the site URL pattern to `content_scripts[0].matches` in `extension/manifest.json`.
4. Do NOT add host permissions or other permissions. `fetch` only goes to Apps Script, so none are needed.

## Done when
`manifest.json` is still valid JSON, the new host is in `matches`, and the user is told to reload the extension.
