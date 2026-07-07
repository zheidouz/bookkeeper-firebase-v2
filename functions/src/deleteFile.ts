// functions/src/deleteFile.ts
//
// Callable Cloud Function (Functions v2, region asia-southeast1)
// that deletes a file from Cloud Storage AND removes the
// fileId from the parent task's `attachedFileIds` array. This
// is the only supported way to delete a file (the storage rules
// lock down the path otherwise; see storage.rules).
//
// Authorization: admin OR the assigned bookkeeper for the task.
// (Per the brief: "admin or assigned bookkeeper only".)

import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  initializeApp,
  getApps,
} from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { deleteFileSchema } from "./zodSchemas.js";

if (getApps().length === 0) {
  initializeApp();
}

const storage = getStorage();

// The admin SDK's `@google-cloud/storage` client always tries HTTPS
// against the emulator host (no `useEmulator` equivalent on admin),
// producing "packet length too long" / EPROTO errors. We branch on
// `FIREBASE_STORAGE_EMULATOR_HOST`:
//   - Emulator: hit the emulator's REST API directly with fetch().
//   - Production: use the admin SDK as before.
// See getFileUrl.ts for the full rationale.
const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const isStorageEmulator = Boolean(emulatorHost);
const EMULATOR_BUCKET_HOST = emulatorHost
  ? emulatorHost.replace(/^https?:\/\//, "").split(":")[0] ?? "127.0.0.1"
  : null;
const EMULATOR_BUCKET_PORT = emulatorHost
  ? Number(emulatorHost.replace(/^https?:\/\//, "").split(":")[1] ?? "9199")
  : 0;
const PROJECT_BUCKET =
  `${process.env.GCLOUD_PROJECT ?? "demo-bookkeeper"}.appspot.com`;

export const deleteFile = onCall(
  { region: "asia-southeast1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to delete files.");
    }

    const parsed = deleteFileSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "taskId and fileId are required.",
      );
    }
    const { taskId, fileId } = parsed.data;
    const uid = request.auth.uid;
    const callerRole =
      (request.auth.token as { role?: string }).role ?? null;

    const db = getFirestore();
    const taskRef = db.doc(`clientFormTasks/${taskId}`);

    // Read the task inside the transaction so we can both
    // check authorization and update the fileIds array atomically.
    await db.runTransaction(async (tx) => {
      const taskSnap = await tx.get(taskRef);
      if (!taskSnap.exists) {
        throw new HttpsError("not-found", "Task not found.");
      }
      const data = taskSnap.data() as Record<string, unknown>;
      const assignedBookkeeperId = String(
        data.assignedBookkeeperId ?? "",
      );

      const isAdmin = callerRole === "admin";
      const isAssignedBookkeeper = uid === assignedBookkeeperId;
      if (!isAdmin && !isAssignedBookkeeper) {
        throw new HttpsError(
          "permission-denied",
          "Only the assigned bookkeeper or an admin can delete files.",
        );
      }

      // Check the file is actually attached to this task before
      // touching Storage. This protects against an admin or
      // compromised caller deleting an arbitrary file at the
      // expected path (which the Storage rules would also block,
      // but defense in depth).
      const attachedFileIds = (data.attachedFileIds as unknown[]) ?? [];
      if (!attachedFileIds.includes(fileId)) {
        throw new HttpsError(
          "not-found",
          "This file is not attached to the given task.",
        );
      }

      // 1. Remove the fileId from the task's attachedFileIds.
      tx.update(taskRef, {
        attachedFileIds: FieldValue.arrayRemove(fileId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // 2. Best-effort delete from Storage. The Storage rules also
    //    enforce admin/assigned-bookkeeper on the path; a
    //    permission-denied here surfaces as an HttpsError to the
    //    caller. The arrayRemove above already committed, so the
    //    file is "orphaned" if the Storage delete fails — the
    //    operator can clean it up via the Admin SDK.
    const bucket = storage.bucket();
    const objectPath = `tasks/${taskId}/files/${fileId}`;
    try {
      if (isStorageEmulator) {
        // Emulator: delete via the emulator's REST API. The
        // storage emulator doesn't enforce rules on its own REST
        // endpoints (rule enforcement only applies to client-SDK
        // uploads); the callable-layer auth check above is the
        // gate.
        const delUrl =
          `http://${EMULATOR_BUCKET_HOST}:${EMULATOR_BUCKET_PORT}` +
          `/storage/v1/b/${PROJECT_BUCKET}/o/` +
          encodeURIComponent(objectPath);
        const res = await fetch(delUrl, { method: "DELETE" });
        // 200 OK, 204 No Content (emulator), and 404 "object not
        // found" all mean the path is gone — all map to success.
        if (
          res.status !== 200 &&
          res.status !== 204 &&
          res.status !== 404
        ) {
          const body = await res.text();
          console.error(
            `deleteFile emulator DELETE failed: ${res.status} ${res.statusText}: ${body}`,
          );
          throw new Error(
            `Emulator delete returned ${res.status} ${res.statusText}`,
          );
        }
      } else {
        await bucket.file(objectPath).delete({ ignoreNotFound: true });
      }
    } catch (err) {
      console.error(
        `deleteFile: storage delete failed for ${objectPath}`,
        err,
      );
      throw new HttpsError(
        "internal",
        "File reference removed from task; storage delete failed. " +
          "An operator will clean up the orphaned object.",
      );
    }

    return { deleted: true, fileId };
  },
);
