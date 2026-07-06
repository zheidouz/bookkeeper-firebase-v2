## Parent

Bookkeeper & Tax Filing Dashboard v1 — https://github.com/zheidouz/bookkeeper-firebase-v2/issues/1

## What to build

The task detail modal/page: opened from "View" in #13 or the client's "Attached forms" list. Shows client details, form details, deadline details, filing history (period covered, who filed, notes), status history (newest-first), and the action buttons. File attachments are added in #16.

Specifically:

- `/tasks/{taskId}` route or a Modal opened from the table (recommend route — shareable URL, deep-linkable from notifications later).
- Sections:
  - **Client card**: businessName, ownerName, tin, link to `/clients/{clientId}`.
  - **Form card**: formCode, formName, category, frequency.
  - **Deadline card**: periodStart, periodEnd, deadlineDate, days-remaining (color-coded), assigned bookkeeper.
  - **Filing history**: derived fields (current period, previousTaskId link if exists, nextTaskId link if exists).
  - **Status history**: list of `taskStatusHistory` rows newest-first; each shows oldStatus → newStatus, changedBy display name, changedAt relative, optional notes.
  - **Notes**: a free-text `<Textarea>` saveable without status change.
  - **Actions**: the legal-next-status buttons (#10), Archive (#11), Edit (when pending), Delete (admin, when pending).
- All write actions update the URL via React Router so refresh preserves state.

## Acceptance criteria

- [ ] Opening a task URL lands on the detail page with all sections populated.
- [ ] Status history renders newest-first with relative timestamps.
- [ ] Notes save without a status change and persist.
- [ ] Action buttons match the legal-next-status set.
- [ ] The page is responsive: sections stack to a single column on mobile.
- [ ] Vitest covers the legal-next-status UI. Playwright critical-e2e covers the full open-and-edit path.

## Blocked by

- Status workflow + transitions + audit history (#9)
- Archive task → atomic create next (callable) (#10)
