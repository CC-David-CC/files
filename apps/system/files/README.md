# Files

Browse temporary guest files or a signed-in account's private server files.
Open documents through the shared desktop document context; Text owns editing.
Successful saves refresh open Files listings through the existing shared service.

“Word count on server” counts the saved UTF-8 document (up to 1 MiB), writes a
separate private report and opens it in Text. Unsaved editor changes are not
included. The server checks identity, read/create permission and source hash.
An accepted operation survives closing Files. Reopening Files retrieves its
saved report; repeating the same request returns that report. Closing a view
or changing accounts prevents its delayed response from opening another app.

The app owns no service process, account database or storage roots. It must not
turn document content into shell commands. See CONTRIBUTING.md for navigation,
lifecycle and storage contracts.

The source candidate also adds **This browser**, an explicit device-local volume
backed by the shared host browser-file service. It works for anonymous visitors,
keeps account scopes separate, and survives the tested close/reopen workflow.
Files opened here compose with Text and use optimistic version checks. Browser
storage can be cleared or evicted; Keep browser files requests a real native
persistence grant and reports denial honestly. Download important files.
This volume is not the live Linux home or a server backup. Copy to Linux makes a
separate temporary copy. See active-system/evidence/browser-files.md; not deployed.
