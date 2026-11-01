# Files

The Files application uses the maintained Chonky React file-browser component.
React and Chonky are bundled into this app and loaded only when Files opens.
The host provides the registered account's browser/server mirror; Files does
not access server folders directly. Opening a text file delegates to Text.

Users can browse, search, sort, change view, use New / Upload on desktop or touch screens to create files or folders or import a file, rename
files using the toolbar or context menu, and delete selected entries. When versions conflict, save the device copy under a new name to keep both, then explicitly choose the device or server version; replacing either copy requires confirmation. Select one synced file and choose **Move to…** to pick a destination folder, or drag it into a folder; moves are journaled locally and use a
version-checked atomic server rename. Select one file or folder and choose **Copy to…** to choose a destination and name for an independent copy. Folder copies include nested files and empty folders. The browser creates the local copy together, then synchronizes its contents individually; an interrupted sync can leave the server copy incomplete until it resumes. Existing local items are not replaced, and server file conflicts require resolution. If another device creates the same destination folder before syncing, its contents can be combined with the copy; conflicting files are retained for resolution. Moving folders is not yet supported.
Each window unmounts its React root and unsubscribes from file changes when closed.

Files has a **Select multiple** mode: tap or click each item to
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

A multi-file drag reports how many files moved if a later move fails; check
the destination before retrying. Folder moves are not supported. Desktop and
phone-sized account tests used mouse-driven dragging, including a collision.

The Files build applies a narrow, hash-pinned Chonky 0.3.10 patch to keep a
drag destination eligible when React DnD's animation-frame hover state is late.
The actual drop still checks the innermost target. After installing the shared
app-builder dependencies, the standard builder runs
`python3 apps/system/files/prepare.py` automatically when Files is selected.
Custom source or entry overlays must stage their dependencies themselves. The
preparer stages the reviewed dependency in ignored
`node_modules` and refuses an unexpected version or a modified staged copy.

When creating a ZIP, Files rechecks the selected files and folder listings
before writing the archive. If a change is detected during assembly, it asks
the user to try again rather than knowingly saving a stale archive. These
checks are not an atomic filesystem snapshot; changes after the last check may
still be absent from the ZIP.

For an account file, select **Open in Text** to inspect or edit UTF-8 text even when its normal Open action launches a different app. The Text editor rejects invalid UTF-8. The action is not offered for temporary Linux files; copy those into My files first.

Uploading to My files asks before replacing an existing file. Skip preserves it; if the file changes while the question is open, the upload stops instead of overwriting the newer version. Multi-file uploads may have already completed earlier files when a later file fails.

Select one or more files and choose **Move to…** to pick their destination once. Files move individually; if one fails, the message reports how many moved so you can inspect before retrying. Folder moves are not available. Desktop and emulated-phone local tests and a live phone-sized account test cover multi-file move and server sync. Physical touch remains unverified.

Select multiple files and choose **Copy to…** to copy them into one destination. Copies are separate operations: if one fails, the message reports how many were copied. Folders can be copied one at a time. Desktop and emulated-phone local tests and a live phone-sized account test cover two files, partial-failure reporting and sync. Physical touch remains unverified.

For each copied file, the browser checks the selected source version and
creates the new local copy in one IndexedDB transaction shared across tabs.
If the local source changed first, Files asks the user to select it again.
Local registered-account desktop and emulated-phone tests cover an uploaded
file changing during that check, refusal, retry, opening the copy in Text,
server sync, fresh-browser reopen, and a second account's isolation. The
copy is a snapshot of this browser's known version. Changes on another device
that have not reached this browser can still be missed; synchronization with
the server is separate, and a destination created there may conflict. Multiple
files are copied and synced separately. Physical touch is unverified.

After copying a temporary Linux file to My files, Files names the account copy and reports that it is syncing. The Linux original remains temporary; wait for a successful sync before relying on the server copy. Local desktop and emulated-phone tests use a real v86 guest, then confirm the account copy remains after guest reset. Physical touch remains unverified.

Select one file and choose **Download** to save its current bytes to your
computer. This is available for My files and temporary Linux files; a changed,
missing or conflicting selection must be refreshed or resolved first. On
phones, select a file and use Download in the toolbar.

You can drop files from your computer into the Files area to upload them to the
currently shown drive and folder. Existing account files prompt before
replacement; dragging a folder in is not supported. The destination is checked
again if the drive or folder changes during an upload. Upload and Download are
separate from moving files within the desktop.

Local desktop Chromium tests cover context-menu switching, actual downloaded
bytes, a browser-protocol file drop, collision cancellation, folder rejection,
internal movement after a drop and cleanup. Phone-sized tests cover the upload
chooser and download; another test downloads actual temporary Linux bytes from
v86. Physical phone interaction and an actual OS file-manager drag were not
verified.

Creating a file with an existing name leaves its contents untouched and asks
the user to choose another name. Local desktop and emulated-phone account tests
cover upload, create, open in Text, edit, save, sync and fresh-session reopen.
Physical touch remains unverified.
