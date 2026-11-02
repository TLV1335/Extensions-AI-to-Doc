---
name: deploy-checklist
description: Reminds the user of the exact manual steps to deploy changes to apps-script/Code.gs. Use after any edit to Code.gs, because an agent cannot deploy Apps Script itself.
---

# Apps Script deploy checklist

After editing `Code.gs`, give the user these steps. Do not skip any, and do not claim the change is live.

1. Paste the new `Code.gs` into the Apps Script editor.
2. Run `testAppend` manually and check the Google Doc.
3. Deploy > Manage deployments > pencil icon > Version: **New version** > Deploy. Do not create a new deployment, because that changes the URL.
4. If scopes or services changed, run any function once to re-grant permissions.

Remind the user: the Web App URL stays the same, and the extension needs no change unless the token was rotated.

## Done when
All four steps appear in your reply.
