# Files

The Files application uses the maintained Chonky React file-browser component.
React and Chonky are bundled into this app and loaded only when Files opens.
The host provides the registered account's browser/server mirror; Files does
not access server folders directly. Opening a text file delegates to Text.

Users can browse, search, sort, change view, use New / Upload on desktop or touch screens to create files or folders or import a file, rename
files using the context menu, and delete selected entries. When versions conflict, save the device copy under a new name to keep both, then explicitly choose the device or server version; replacing either copy requires confirmation. Synced files can be dragged into folders; moves are journaled locally and use a
version-checked atomic server rename. Moving folders is not yet supported.
Download is not offered. Each window
unmounts its React root and unsubscribes from file changes when closed.

Files can import local files into account storage. PNG, JPEG, and WebP images
open in Image Editor; text documents open in Text.
