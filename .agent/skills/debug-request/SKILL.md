---
name: debug-request
description: Diagnoses why pressing the shortcut does not append text to the Google Doc in the AI-to-Google-Docs extension. Use when the user reports an error toast, no reaction, or a failed request.
---

# Debug the request

Go through the table in order and stop at the first match.

| Symptom | Check |
|---|---|
| No toast at all | Shortcut conflict (chrome://extensions/shortcuts or edge://extensions/shortcuts); content script not loaded (reload the tab) |
| "content not found" | Use the fix-selector skill |
| "Chưa cấu hình URL/token" | Options page not saved |
| `Unexpected token '<'` | Web app access is not "Anyone", or the URL ends in /dev instead of /exec |
| `unauthorized` | Token in Options differs from TOKEN in Script Properties (watch for stray spaces) |
| Code edited, behaviour unchanged | No "New version" on deploy (use deploy-checklist) |
| `You do not have permission...` | testAppend never run to grant permission, or DOC_ID wrong / no edit rights |
| `ok: true, duplicate: true` | Same text as the previous send; delete the LAST_HASH script property to resend |

Ask the user for the exact error text, and if needed the log from chrome://extensions > the extension > "service worker" > Console. Do not guess.
