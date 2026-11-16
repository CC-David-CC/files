# Files

An independently owned Chonky/React file-browser view. The historical `apps/system/files/` baseline, its tests, mirror features and dependency patch provenance remain preserved. The public `@webos/files` package uses the same pinned Chonky 0.3.10 and React 19.2.0 libraries with a new explicit server-authoritative domain controller. It does not load the old mirror/guest interface or report local browser writes as account saves.

Synchronous `mount` requires the shared Storage service, exact instance/session identities, an opaque caller authority and authorizer, and an `openFile` callback. Async `ready` reports the initial real server listing. UI and the public `execute` interface call the same controller. Ordinary inspection returns browsing metadata, not credentials or file bytes. Closing a Files view disposes its UI and downloads, retaining the shared Storage service.

Current server operations cover listing/navigation, upload, new folder, revision-checked rename/move/delete, snapshot download and opening through the host. File revisions are read before confirmation dialogs and supplied as exact mutation preconditions. Upload creates a new file and refuses a collision. Acknowledged saves remain acknowledged if a later listing refresh fails. Interrupted mutations are reported as outcome unknown, never automatically retried or labelled saved. Backend account authority enforces ownership regardless of UI visibility.

The parent's files_upload_browser.mjs verifies the actual toolbar picker and browser-protocol external-file drops with 4 MiB binary payloads, exact server-backed byte/hash round trips, a fresh browser context, cancellation, collisions and destination changes. The separate viewer_browser.mjs covers the existing desktop/window and Text/WordCraft account-file workflows. Existing baseline helper tests cover the preserved implementation separately. These are not physical OS drag, media decoding or delegated-agent qualifications.

External files can be dropped into Files or selected with Upload. Both paths use the same server-authoritative import operation and show upload/confirmation/error messages. Picker selection and each batch item retain the intended folder; navigation cannot redirect a pending import. Folder drops are rejected. Existing names are refused without overwriting account bytes. File-picker selection and cancellation use native input events with listeners removed on unmount.

Legacy recursive copy, archive/extraction, multi-selection management workflows, background mirror/draft recovery, internal drag moves and server word-count are preserved but not yet ported into this interface. Internal Chonky drag/drop remains disabled. Folder deletion follows the backend's empty-folder rule; folder moves remain unavailable. The parent viewer opens Text and WordCraft through the public host callback. No live account data was copied or migrated.

Move accepts a destination path relative to My files and uses Storage's revision-checked rename operation. It never implements a copy/delete substitute. Folder moves remain unsupported; destination collisions and permission checks are enforced by the server.

Operation authorization receives the captured browsing directory, source path,
computed destination (for import, mkdir, rename and move), and expected source
revision. If navigation changes the directory while authorization waits, the
pending operation is refused before Storage runs. A grant for one folder cannot
follow a later navigation into another. Tests cover this race and policies that
grant one destination while denying another. This is a local domain boundary;
delegated server authentication remains a separate integration requirement.
