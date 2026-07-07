// AttachedFilesCard — slice #16 (task file upload + signed URLs).
//
// Mounted on the task detail page. Lets the assigned bookkeeper (or an
// admin) drag-and-drop files into Cloud Storage under
// `tasks/{taskId}/files/{fileId}`, persists metadata onto the parent
// `clientFormTasks/{taskId}` doc, and renders a list with download +
// delete actions. Read-only mode disables the upload zone + delete
// buttons.
//
// The path scheme (`tasks/{taskId}/files/{fileId}`) matches the
// `storage.rules` gate AND what `getFileUrl`/`deleteFile` resolve to —
// the callable does NOT take the path from the client; it always
// rebuilds it from `{taskId, fileId}` so the client can never point at
// an arbitrary bucket location.

import { useCallback, useMemo, useRef, useState } from "react";
import { arrayUnion, serverTimestamp, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db, functions, storage } from "@/lib/firebaseConfig";
import { useAuth } from "@/features/auth/useAuth";
import { allClientFormTasksQueryKey } from "@/features/tasks/useAllClientFormTasks";

export interface AttachedFileMeta {
  fileId: string;
  fileName: string;
  uploadedAt: { toDate?: () => Date } | Timestamp | Date | null;
}

interface AttachedFilesCardProps {
  taskId: string;
  /** Hide upload zone + delete buttons (e.g. archived/read-only viewers). */
  readOnly?: boolean;
}

interface GetFileUrlResponse {
  url: string;
  expiresAt: number;
}

interface DeleteFileResponse {
  deleted: boolean;
  fileId: string;
}

function metaToDate(value: AttachedFileMeta["uploadedAt"]): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function relativeTime(d: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - d.getTime();
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  let value: string;
  if (sec < 60) value = `${sec}s`;
  else if (min < 60) value = `${min}m`;
  else if (hr < 24) value = `${hr}h`;
  else if (day < 30) value = `${day}d`;
  else value = `${Math.round(day / 30)}mo`;
  return diffMs < 0 ? `in ${value}` : `${value} ago`;
}

export default function AttachedFilesCard({
  taskId,
  readOnly = false,
}: AttachedFilesCardProps) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Pull the live task from the same onSnapshot cache the page consumes
  // (single source of truth — no extra subscription).
  const liveTask = useMemo(() => {
    const rows =
      qc.getQueryData<Array<Record<string, unknown>>>(allClientFormTasksQueryKey) ??
      [];
    return rows.find((r) => (r as { id: string }).id === taskId) ?? null;
  }, [qc, taskId]);

  const meta = useMemo(() => {
    const raw = (liveTask as { attachedFileMeta?: Record<string, AttachedFileMeta> } | null)
      ?.attachedFileMeta;
    if (!raw) return [];
    return Object.values(raw);
  }, [liveTask]);

  const sortedMeta = useMemo(() => {
    return [...meta].sort((a, b) => {
      const ad = metaToDate(a.uploadedAt)?.getTime() ?? 0;
      const bd = metaToDate(b.uploadedAt)?.getTime() ?? 0;
      return bd - ad;
    });
  }, [meta]);

  const assignedBookkeeperId = (liveTask as { assignedBookkeeperId?: string } | null)
    ?.assignedBookkeeperId;
  const isAssigned = !!user && !!assignedBookkeeperId && user.uid === assignedBookkeeperId;
  const isAdmin = role === "admin";
  const canDelete = !readOnly && (isAdmin || isAssigned);
  const canUpload = !readOnly && (isAdmin || isAssigned);

  const invalidateTaskCaches = useCallback(() => {
    qc.invalidateQueries({ queryKey: allClientFormTasksQueryKey });
    qc.invalidateQueries({ queryKey: ["clientFormTasks", "single", taskId] });
    qc.invalidateQueries({ queryKey: ["clientFormTasks", taskId] });
    qc.invalidateQueries({ queryKey: ["clientFormTasks", taskId, "files"] });
  }, [qc, taskId]);

  const uploadOneFile = useCallback(
    async (file: File) => {
      const fileId = uuidv4();
      const objectPath = `tasks/${taskId}/files/${fileId}`;
      const ref = storageRef(storage, objectPath);
      await uploadBytes(ref, file);
      // Persist metadata onto the task doc. The backend
      // (deleteFile) reads `attachedFileIds` so we MUST keep that
      // array in sync; `attachedFileMeta` is a separate map for the UI.
      const uploadedAt = Timestamp.now();
      const { doc: fsDoc, updateDoc } = await import(
        "firebase/firestore"
      );
      const taskRef = fsDoc(db, "clientFormTasks", taskId);
      await updateDoc(taskRef, {
        attachedFileIds: arrayUnion(fileId),
        attachedFileMeta: {
          [fileId]: {
            fileId,
            fileName: file.name,
            uploadedAt,
          },
        },
        updatedAt: serverTimestamp(),
      });
    },
    [taskId],
  );

  const handleFiles = useCallback(
    async (filesList: FileList | File[] | null | undefined) => {
      if (!filesList || (filesList instanceof FileList && filesList.length === 0)) {
        return;
      }
      const files = Array.from(filesList instanceof FileList ? filesList : filesList);
      if (files.length === 0) return;
      setError(null);
      setUploadingCount(files.length);
      const failed: string[] = [];
      for (const f of files) {
        try {
          await uploadOneFile(f);
        } catch (err) {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : String(err);
          failed.push(`${f.name}: ${msg}`);
        }
      }
      setUploadingCount(0);
      if (failed.length > 0) {
        setError(failed.join("\n"));
      }
      invalidateTaskCaches();
    },
    [invalidateTaskCaches, uploadOneFile],
  );

  async function handleDownload(fileId: string) {
    setError(null);
    try {
      const fn = httpsCallable<
        { taskId: string; fileId: string },
        GetFileUrlResponse
      >(functions, "getFileUrl");
      const { data } = await fn({ taskId, fileId });
      if (typeof window !== "undefined") {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Download failed.";
      setError(msg);
    }
  }

  async function handleDelete(fileId: string) {
    if (!canDelete) return;
    setError(null);
    try {
      const fn = httpsCallable<
        { taskId: string; fileId: string },
        DeleteFileResponse
      >(functions, "deleteFile");
      await fn({ taskId, fileId });
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Delete failed.";
      setError(msg);
    } finally {
      invalidateTaskCaches();
    }
  }

  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    setDragOver(false);
    if (!canUpload) return;
    void handleFiles(ev.dataTransfer.files);
  }

  function handleDragOver(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    if (!canUpload) return;
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  return (
    <Card className="p-4" data-testid="attached-files-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Attached files
        </h2>
        {uploadingCount > 0 && (
          <span
            className="text-xs text-slate-500"
            data-testid="upload-progress"
          >
            Uploading {uploadingCount} file{uploadingCount === 1 ? "" : "s"}…
          </span>
        )}
      </div>

      {canUpload && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="file-upload-zone"
          data-dragover={dragOver ? "true" : "false"}
          className={
            "mt-2 flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center text-sm transition-colors " +
            (dragOver
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400")
          }
        >
          <span className="font-medium text-slate-700">
            Drag files here or click to upload
          </span>
          <span className="mt-1 text-xs text-slate-500">
            Files are stored under <code className="font-mono">tasks/{taskId}/files/&lt;uuid&gt;</code>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            data-testid="file-upload-input"
            onChange={(ev) => {
              void handleFiles(ev.target.files);
              // Allow re-uploading the same file twice in a row.
              ev.target.value = "";
            }}
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="attached-files-error"
          className="mt-3 whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div
        className="mt-3 space-y-2"
        data-testid="attached-files-list"
        data-count={sortedMeta.length}
      >
        {sortedMeta.length === 0 ? (
          <div className="text-xs text-slate-500" data-testid="attached-files-empty">
            No files attached.
          </div>
        ) : (
          sortedMeta.map((m) => {
            const uploadedAt = metaToDate(m.uploadedAt);
            return (
              <div
                key={m.fileId}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                data-testid="attached-file-row"
                data-file-id={m.fileId}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium text-slate-900"
                    title={m.fileName}
                  >
                    {m.fileName}
                  </div>
                  <div
                    className="text-xs text-slate-500"
                    data-testid="attached-file-uploaded-at"
                  >
                    {uploadedAt
                      ? relativeTime(uploadedAt)
                      : "no timestamp"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDownload(m.fileId)}
                    data-testid="download-file-btn"
                    data-file-id={m.fileId}
                  >
                    Download
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-700"
                      onClick={() => void handleDelete(m.fileId)}
                      data-testid="delete-file-btn"
                      data-file-id={m.fileId}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!canUpload && !readOnly && (
        <p className="mt-2 text-xs italic text-slate-400">
          You don&apos;t have upload access for this task.
        </p>
      )}
    </Card>
  );
}
