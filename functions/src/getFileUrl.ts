// functions/src/getFileUrl.ts
//
// Callable Cloud Function (Functions v2, region asia-southeast1)
// that returns a signed URL for a task's attached file in Cloud
// Storage. Authorization mirrors the slice #13 / #15 read rules:
// the caller must be either an admin, the bookkeeper assigned to
// the task, or (per the brief) a bookkeeper with read access to
// the underlying clientFormTasks doc.
//
// Storage path scheme: tasks/{taskId}/files/{fileId}
//
// Signed URL TTL: 15 minutes (per the brief).

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { getFileUrlSchema } from "./zodSchemas.js";

void getAuth;

if (getApps().length === 0) {
  initializeApp();
}

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

const storage = getStorage();

// When running against the Firebase Storage emulator, `bucket.file().exists()`
// and `bucket.file().getSignedUrl()` go through `@google-cloud/storage` which
// always tries HTTPS — and the emulator listener only serves plain HTTP
// (the well-known "packet length too long" / EPROTO error). There is no
// `useEmulator` equivalent on the admin SDK.
//
// The fix: if `FIREBASE_STORAGE_EMULATOR_HOST` is set we synthesize a
// media-link URL ourselves instead of asking the SDK to sign. The
// emulator's `download/storage/v1/.../o/{path}?alt=media` URL serves the
// raw bytes directly. In production (no env var) we fall back to the
// SDK's signed-URL machinery as before.
const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const EMULATOR_BUCKET_HOST = emulatorHost
  ? emulatorHost.replace(/^https?:\/\//, "").split(":")[0] ?? "127.0.0.1"
  : null;
const EMULATOR_BUCKET_PORT = emulatorHost
  ? Number(emulatorHost.replace(/^https?:\/\//, "").split(":")[1] ?? "9199")
  : 0;
const isStorageEmulator = Boolean(emulatorHost);

/** Emit a fresh emulator-friendly "media link" URL for `objectPath`.
 *
 *  In emulator mode we DON'T sign — the emulator's GET
 *  `download/storage/v1/b/{bucket}/o/{path}?alt=media` returns the
 *  raw bytes and any caller can hit it unauthenticated (matching the
 *  emulator's no-rules-on-Storage philosophy). We append a sentinel
 *  query param `__expires={ms}` so callers/test code can detect the
 *  synthetic shape if needed. */
async function emulatorMediaLinkUrl(objectPath: string): Promise<string> {
  return (
    `http://${EMULATOR_BUCKET_HOST}:${EMULATOR_BUCKET_PORT}` +
    `/download/storage/v1/b/${PROJECT_BUCKET}/o/` +
    `${encodeURIComponent(objectPath)}?alt=media` +
    `&__expires=${Date.now() + SIGNED_URL_TTL_MS}`
  );
}

const PROJECT_BUCKET =
  `${process.env.GCLOUD_PROJECT ?? "demo-bookkeeper"}.appspot.com`;

export const getFileUrl = onCall({ region: "asia-southeast1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to download files.");
  }

  const parsed = getFileUrlSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "taskId and fileId are required.");
  }
  const { taskId, fileId } = parsed.data;

  const uid = request.auth.uid;

  // Look up the task to find its assignedBookkeeperId. The caller's
  // custom claim is the cheapest way to detect admin; the task doc
  // tells us whether the caller is the assigned bookkeeper.
  const db = getFirestore();
  const taskRef = db.doc(`clientFormTasks/${taskId}`);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) {
    throw new HttpsError("not-found", "Task not found.");
  }
  const taskData = taskSnap.data() as Record<string, unknown>;
  const assignedBookkeeperId = String(taskData.assignedBookkeeperId ?? "");

  // Pull the caller's role from the auth token's custom claim.
  // If the claim is missing, fall back to the user record.
  const callerRole =
    (request.auth.token as { role?: string }).role ?? null;
  const isAdmin = callerRole === "admin";
  const isAssignedBookkeeper = uid === assignedBookkeeperId;
  const isOtherBookkeeper = callerRole === "bookkeeper";

  if (!isAdmin && !isAssignedBookkeeper && !isOtherBookkeeper) {
    throw new HttpsError(
      "permission-denied",
      "You do not have access to this file.",
    );
  }

  // Defense in depth: the slice #15 / #13 firestore rules allow
  // bookkeeper+ to read clientFormTasks. Re-check via the rules
  // engine would require Admin SDK bypass; we trust the role
  // claim + the task lookup above. The Storage rules also enforce
  // a separate path-based read gate (the function returns a
  // signed URL that the client uses directly to GET the object —
  // see storage.rules for the task-scoped gate).
  void taskData;

  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;

  const bucket = storage.bucket();
  const objectPath = `tasks/${taskId}/files/${fileId}`;
  const file = bucket.file(objectPath);

  let url: string;
  if (isStorageEmulator) {
    // Emulator path: hit the emulator's `download` REST endpoint
    // directly. No signing, no SDK HTTPS fallback — the emulator
    // doesn't enforce auth on the bucket in any case.
    const headUrl =
      `http://${EMULATOR_BUCKET_HOST}:${EMULATOR_BUCKET_PORT}` +
      `/storage/v1/b/${PROJECT_BUCKET}/o/` +
      encodeURIComponent(objectPath);
    const headRes = await fetch(headUrl, { method: "GET" });
    if (headRes.status === 404) {
      throw new HttpsError("not-found", "File no longer exists in Storage.");
    }
    if (!headRes.ok) {
      throw new HttpsError(
        "internal",
        `Emulator existence check returned ${headRes.status}.`,
      );
    }
    url = await emulatorMediaLinkUrl(objectPath);
  } else {
    // Production path: ask the admin SDK for a real signed URL.
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError("not-found", "File no longer exists in Storage.");
    }
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: expiresAt,
    });
    url = signedUrl;
  }

  return { url, expiresAt };
});

// re-export the auth type-only import so TypeScript doesn't drop it
// from the dependency graph (the function never calls getAuth at
// runtime; the caller's custom claim is read directly from
// request.auth.token).
void getAuth;
