# Files

The Files application uses the maintained Chonky React file-browser component.
React and Chonky are bundled into this app and loaded only when Files opens.
The host provides the registered account's browser/server mirror; Files does
not access server folders directly. Opening a text file delegates to Text.

Users can browse, search, sort, change view, use New / Upload on desktop or touch screens to create files or folders or import a file, rename
files using the toolbar or context menu, and delete selected entries. When versions conflict, save the device copy under a new name to keep both, then explicitly choose the device or server version; replacing either copy requires confirmation. Select one synced file and choose **Move to…** to pick a destination folder, or drag it into a folder; moves are journaled locally and use a
version-checked atomic server rename. Select one file or folder and choose **Copy to…** to choose a destination and name for an independent copy. Folder copies include nested files and empty folders. The browser creates the local copy together, then synchronizes its contents individually; an interrupted sync can leave the server copy incomplete until it resumes. Existing local items are not replaced, and server file conflicts require resolution. If another device creates the same destination folder before syncing, its contents can be combined with the copy; conflicting files are retained for resolution. Moving folders is not yet supported.
Download is not offered. Each window
unmounts its React root and unsubscribes from file changes when closed.

The local candidate has a **Select multiple** mode: tap or click each item to
toggle its selection, then choose **Done selecting** before using an action.
The current selection remains available after leaving the mode. This provides
multi-selection without a physical Ctrl key. A multi-file upload or deletion
is still performed one item at a time. If it stops after some items succeed,
Files says how many completed and asks you to check before retrying. Conflicting
selected items are checked before deletion starts.

Files can import local files into account storage. PNG, JPEG, and WebP images
open in Image Editor; text documents open in Text.

**Sync now** checks the server immediately for changes, including files changed
outside the browser. Successful idle sessions check less often in the background;
local changes still sync immediately. If the server is unavailable or busy,
Files reports the pending/error state and retries; it does not claim a server check succeeded before the first successful sync. Manual sync errors clear after a successful automatic retry. A browser save is not a guarantee that the server has received it.

On My files, **Extract ZIP** validates the archive and creates the destination tree together in browser storage. A changed ZIP or existing destination leaves the local tree unchanged. The resulting files and folders then sync individually, so server copies can be incomplete while sync is pending; simultaneous server-side folder creation may merge folders and conflicting files require resolution. Extraction into temporary Linux storage still proceeds item by item and can leave a partial folder on failure. Local desktop, emulated-phone and 4K and live emulated-phone account tests cover nested and empty folders, collisions, changed ZIPs and fresh-session recovery.

Empty files created in temporary Linux can be listed and explicitly copied to My files; the copy persists after Linux restarts. Local desktop, emulated-phone and 4K, and live emulated-phone workflows tested shell-created and browser-created empty files. Linux home itself remains temporary.
