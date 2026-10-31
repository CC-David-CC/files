# Files

The Files application uses the maintained Chonky React file-browser component.
React and Chonky are bundled into this app and loaded only when Files opens.
The host provides the registered account's browser/server mirror; Files does
not access server folders directly. Opening a text file delegates to Text.

Users can browse, search, sort, change view, use New / Upload on desktop or touch screens to create files or folders or import a file, rename
files using the toolbar or context menu, and delete selected entries. When versions conflict, save the device copy under a new name to keep both, then explicitly choose the device or server version; replacing either copy requires confirmation. Select one synced file and choose **Move to…** to pick a destination folder, or drag it into a folder; moves are journaled locally and use a
version-checked atomic server rename. Select one file and choose **Copy to…** to choose a folder and name for an independent copy. Copies do not replace existing files. Moving or copying folders is not yet supported.
Download is not offered. Each window
unmounts its React root and unsubscribes from file changes when closed.

Files can import local files into account storage. PNG, JPEG, and WebP images
open in Image Editor; text documents open in Text.

**Sync now** checks the server immediately for changes, including files changed
outside the browser. Successful idle sessions check less often in the background;
local changes still sync immediately. If the server is unavailable or busy,
Files reports the pending/error state and retries; it does not claim a server check succeeded before the first successful sync. Manual sync errors clear after a successful automatic retry. A browser save is not a guarantee that the server has received it.
