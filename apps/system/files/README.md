# Files

The Files application uses the maintained Chonky React file-browser component.
React and Chonky are bundled into this app and loaded only when Files opens.
The host provides the registered account's browser/server mirror; Files does
not access server folders directly. Opening a text file delegates to Text.

Users can browse, search, sort, change view, create files or folders, rename
files using the context menu, and delete selected entries. Conflicts offer explicit choices. Synced files can be dragged into folders; moves are journaled locally and use a
version-checked atomic server rename. Moving folders is not yet supported.
Download is not offered. Each window
unmounts its React root and unsubscribes from file changes when closed.
