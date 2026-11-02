---
name: security-review
description: Scans the AI-to-Google-Docs project for leaked secrets and excess permissions before committing, sharing or publishing. Use when the user is about to push to git or share the code.
---

# Security review

## Steps
1. Search the whole repo for: the Apps Script deployment ID (strings starting `AKfycb`), `/macros/s/`, the token value, and a real Google Doc ID. None may appear.
2. Check `extension/manifest.json`: permissions must be only `storage`, with host permissions limited to `script.google.com` and `script.googleusercontent.com`. Flag anything else.
3. Confirm URL and token are read only from `chrome.storage.local` and Script Properties, never hardcoded.
4. If the user keeps local config files, check a `.gitignore` covers them.

## Done when
You list what was scanned, what was found, and what needs fixing.
