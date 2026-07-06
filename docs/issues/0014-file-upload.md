## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

File upload + signed-URL downloads for task attachments. After this slice, a bookkeeper can drag a PDF (e.g., the filed return) into the task detail page and later download it via a one-click signed URL.

Specifically:

- Cloud Storage path: `tasks/{taskId}/files/{uuid}` — files scoped under the task.
- Cloud Function `getFileUrl({taskId, fileId})` — callable; checks that the caller is allowed to read the task (bookkeeper assigned, or admin); returns a signed URL valid for 15 minutes.
- Cloud Function `deleteFile({taskId, fileId})` — callable; admin or assigned bookkeeper only; deletes from Storage AND removes the `attachedFileIds` entry on the task.
- Upload UI: drag-and-drop zone in the task detail page (#14). On drop, the file uploads to Storage; on success, appends the fileId to `task.attachedFileIds` and renders the filename in a list.
- Download UI: each attached file in the list has a "Download" button that calls `getFileUrl` and `window.open`s the URL.
- Storage rules: only admin or `request.auth.uid` matching the task's `assignedBookkeeperId` can upload to `tasks/{taskId}/files/{fileId}`. All authenticated roles can read signed URLs.

## Acceptance criteria

- [ ] Dragging a PDF onto the task detail upload zone stores it at the right path and renders in the file list.
- [ ] Clicking Download on an attached file opens the signed URL and downloads the file.
- [ ] A non-assigned bookkeeper (not admin) calling `getFileUrl` for a task they're not assigned to is rejected.
- [ ] Storage rules reject writes from staff (or any role without the right to upload).
- [ ] Deleting a file removes it from both Storage and the task's `attachedFileIds`.
- [ ] Vitest covers the validation. Emulator tests cover Storage rules and the callables.

## Blocked by

- Task detail page (history + notes + actions) (#14)
