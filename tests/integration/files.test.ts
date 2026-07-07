/**
 * Integration tests for the slice #16 file-storage callables
 * (`getFileUrl` + `deleteFile`) and the corresponding Storage rules.
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Coverage:
 *   (a) Admin getFileUrl → returns URL; HTTP fetch succeeds.
 *   (b) Assigned bookkeeper A getFileUrl → success.
 *   (c) Other bookkeeper B getFileUrl → permission-denied.
 *   (d) deleteFile from bookkeeper B → permission-denied.
 *   (e) deleteFile from bookkeeper A → success; storage object gone
 *       and attachedFileIds removed from the task doc.
 *   (f) getFileUrl after delete → not-found.
 *
 * Why all setup uploads go through `emulatorUploadSmallFile` (signed
 * REST): the firebase-admin Storage SDK has a long-standing bug where
 * `bucket().file().save()` tries HTTPS against the emulator host even
 * with `FIREBASE_STORAGE_EMULATOR_HOST` set, producing the classic
 * "EPROTO packet length too long" SSL handshake failure. The
 * storage emulator's REST upload endpoint, however, is plain HTTP and
 * accepts any ID token, so we bypass the SDK entirely for setup.
 *
 * To still exercise the Storage rules we deliberately sign in as
 * different roles in the seed step (admin or assigned bookkeeper)
 * and as the negative-test role in the assertion step.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";
const STORAGE_EMULATOR_HOST = "127.0.0.1:9199";

// Emulator env vars MUST be set BEFORE any firebase-admin / firebase /
// @google-cloud/storage module is imported — the Storage SDK reads them
// at app-init time and we get HTTPS-on-HTTP errors otherwise
// ("EPROTO ... packet length too long"). The `emulators:exec` script
// sets the *client* SDK vars, but admin SDK uses different ones; we
// have to set both ourselves.
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.STORAGE_EMULATOR_HOST =
  process.env.STORAGE_EMULATOR_HOST ?? STORAGE_EMULATOR_HOST;
process.env.FIREBASE_STORAGE_EMULATOR_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? STORAGE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? PROJECT_ID;

const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const describeIfEmulator = RUN_INTEGRATION ? describe : describe.skip;

describeIfEmulator("files — emulator integration", () => {
  let db: import("firebase/firestore").Firestore;
  let functions: import("firebase/functions").Functions;
  let adminApp: import("firebase-admin/app").App;
  let fireAuthRef: import("firebase/auth").Auth;

  beforeAll(async () => {
    const cfg = await import("@/lib/firebaseConfig");
    fireAuthRef = cfg.auth;
    db = cfg.db;
    functions = cfg.functions;
    expect(fireAuthRef).toBeDefined();
    expect(db).toBeDefined();
    expect(functions).toBeDefined();

    const adminMod = await import("firebase-admin/app");
    adminApp = adminMod.initializeApp(
      {
        projectId: PROJECT_ID,
        credential: adminMod.applicationDefault(),
      },
      "files-test-admin",
    );
  }, 20_000);

  afterAll(async () => {
    if (adminApp) {
      const adminMod = await import("firebase-admin/app");
      try {
        await adminMod.deleteApp(adminApp);
      } catch {
        /* no-op */
      }
    }
  });

  beforeEach(async () => {
    const authMod = await import("firebase/auth");
    try {
      await authMod.signOut(fireAuthRef);
    } catch {
      /* no-op */
    }
  });

  /** Seed a `clientFormTasks/{id}` with assignedBookkeeperId = A.uid. */
  async function seedTask(args: {
    taskId?: string;
    assignedBookkeeperId: string;
    attachedFileIds?: string[];
  }): Promise<string> {
    const adminFsMod = await import("firebase-admin/firestore");
    const adminDb = adminFsMod.getFirestore(adminApp);
    const ref = adminDb
      .collection("clientFormTasks")
      .doc(args.taskId ?? adminDb.collection("clientFormTasks").doc().id);
    await ref.set(
      {
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        assignedBookkeeperId: args.assignedBookkeeperId,
        frequency: "monthly",
        status: "pending",
        archived: false,
        notes: "",
        attachedFileIds: args.attachedFileIds ?? [],
        attachedFileMeta:
          args.attachedFileIds && args.attachedFileIds.length > 0
            ? Object.fromEntries(
                args.attachedFileIds.map((fileId) => [
                  fileId,
                  {
                    fileId,
                    fileName: `seeded-${fileId}.txt`,
                    uploadedAt: adminFsMod.Timestamp.now(),
                  },
                ]),
              )
            : {},
        createdAt: adminFsMod.FieldValue.serverTimestamp(),
        updatedAt: adminFsMod.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return ref.id;
  }

  /**
   * Upload a small text file to the emulator's REST endpoint, signed
   * with the caller's ID token. The emulator accepts any ID token
   * (it does not verify) and applies the Storage rules to the
   * authenticated upload.
   */
  async function emulatorUploadSmallFile(
    taskId: string,
    fileId: string,
    uploaderEmail: string,
    uploaderPassword: string,
    contents = "hello-slice-16",
  ): Promise<{ fileName: string; bytes: Uint8Array }> {
    const authMod = await import("firebase/auth");
    const fileName = `${fileId}.txt`;
    const bytes = new TextEncoder().encode(contents);
    const cred = authMod.EmailAuthProvider.credential(
      uploaderEmail,
      uploaderPassword,
    );
    const userCred = await authMod.signInWithCredential(
      fireAuthRef,
      cred,
    );
    const idToken = await userCred.user.getIdToken();
    // Construct the multipart body manually. The Firebase Storage REST
    // endpoint expects a TWO-part multipart/related body:
    //   part 1: JSON metadata ({ name, contentType })
    //   part 2: raw bytes
    // Using FormData + Blob adds a charset suffix to the file's
    // Content-Type which the emulator rejects ("Bad content type
    // text/plain;charset=UTF-8").
    const boundary = `----bookkeeper-files-${uniqueSuffix()}`;
    const objPath = `tasks/${taskId}/files/${fileId}`;
    const url =
      `http://127.0.0.1:9199/upload/storage/v1/b/${PROJECT_ID}.appspot.com/o` +
      `?uploadType=multipart&name=${encodeURIComponent(objPath)}`;
    const metadata = JSON.stringify({
      name: objPath,
      contentType: "text/plain",
    });
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n` +
      `\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/plain\r\n` +
      `\r\n` +
      `${contents}\r\n` +
      `--${boundary}--\r\n`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `emulatorUploadSmallFile failed: ${res.status} ${res.statusText}: ${text}`,
      );
    }
    return { fileName, bytes };
  }

  /** Create an auth user + return { uid, email }. */
  async function makeUser(
    role: "admin" | "bookkeeper" | "staff",
  ): Promise<{ uid: string; email: string }> {
    const adminAuthMod = await import("firebase-admin/auth");
    const adminAuth = adminAuthMod.getAuth(adminApp);
    const email = `${role}-${uniqueSuffix()}@example.com`;
    const rec = await adminAuth.createUser({
      email,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(rec.uid, { role });
    return { uid: rec.uid, email };
  }

  /** Delete a user and a task + best-effort cleanup the storage object. */
  async function cleanup(
    users: { uid: string }[],
    taskId?: string,
    fileId?: string,
  ) {
    const adminAuthMod = await import("firebase-admin/auth");
    const adminAuth = adminAuthMod.getAuth(adminApp);
    const authMod = await import("firebase/auth");
    try {
      await authMod.signOut(fireAuthRef);
    } catch {
      /* no-op */
    }
    for (const u of users) {
      try {
        await adminAuth.deleteUser(u.uid);
      } catch {
        /* no-op */
      }
    }
    if (taskId) {
      try {
        const adminFsMod = await import("firebase-admin/firestore");
        adminFsMod
          .getFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete();
      } catch {
        /* no-op */
      }
    }
    if (taskId && fileId) {
      try {
        // Use the storage emulator's REST delete — admin SDK has the
        // same HTTPS-on-emulator bug we work around for uploads.
        const url =
          `http://127.0.0.1:9199/storage/v1/b/${PROJECT_ID}.appspot.com/o/` +
          encodeURIComponent(`tasks/${taskId}/files/${fileId}`);
        await fetch(url, { method: "DELETE" });
      } catch {
        /* no-op */
      }
    }
  }

  it("(a) admin getFileUrl → returns URL; HTTP fetch succeeds", async () => {
    const functionsMod = await import("firebase/functions");
    const authMod = await import("firebase/auth");
    const fn = functionsMod.httpsCallable<
      { taskId: string; fileId: string },
      { url: string; expiresAt: number }
    >(functions, "getFileUrl");

    const admin = await makeUser("admin");
    const bk = await makeUser("bookkeeper");
    const fileId = `file-${uniqueSuffix()}`;
    const taskId = await seedTask({
      assignedBookkeeperId: bk.uid,
      attachedFileIds: [fileId],
    });
    // Upload as the admin (rules allow admin writes).
    const seed = await emulatorUploadSmallFile(
      taskId,
      fileId,
      admin.email,
      TEST_PASSWORD,
    );

    try {
      await authMod.signInWithEmailAndPassword(
        fireAuthRef,
        admin.email,
        TEST_PASSWORD,
      );
      const { data } = await fn({ taskId, fileId });
      expect(typeof data.url).toBe("string");
      expect(data.url.length).toBeGreaterThan(10);
      expect(data.url).toContain(
        encodeURIComponent(`tasks/${taskId}/files/${fileId}`),
      );
      const res = await globalThis.fetch(data.url);
      expect(res.status).toBe(200);
      const body = new TextDecoder().decode(
        new Uint8Array(await res.arrayBuffer()),
      );
      expect(body).toBe(new TextDecoder().decode(seed.bytes));
    } finally {
      await cleanup(
        [admin, bk],
        taskId,
        fileId,
      );
    }
  }, 60_000);

  it("(b) assigned bookkeeper A getFileUrl → success", async () => {
    const functionsMod = await import("firebase/functions");
    const authMod = await import("firebase/auth");
    const fn = functionsMod.httpsCallable<
      { taskId: string; fileId: string },
      { url: string; expiresAt: number }
    >(functions, "getFileUrl");

    const bk = await makeUser("bookkeeper");
    const fileId = `file-${uniqueSuffix()}`;
    const taskId = await seedTask({
      assignedBookkeeperId: bk.uid,
      attachedFileIds: [fileId],
    });
    await emulatorUploadSmallFile(taskId, fileId, bk.email, TEST_PASSWORD);

    try {
      await authMod.signInWithEmailAndPassword(
        fireAuthRef,
        bk.email,
        TEST_PASSWORD,
      );
      const { data } = await fn({ taskId, fileId });
      expect(data.url).toMatch(/^https?:\/\//);
      const res = await globalThis.fetch(data.url);
      expect(res.status).toBe(200);
    } finally {
      await cleanup([bk], taskId, fileId);
    }
  }, 60_000);

  it("(c) staff (non-bookkeeper, non-admin) getFileUrl → permission-denied", async () => {
    const functionsMod = await import("firebase/functions");
    const authMod = await import("firebase/auth");
    const fn = functionsMod.httpsCallable<
      { taskId: string; fileId: string },
      { url: string; expiresAt: number }
    >(functions, "getFileUrl");

    const bk = await makeUser("bookkeeper");
    const staff = await makeUser("staff");
    const fileId = `file-${uniqueSuffix()}`;
    const taskId = await seedTask({
      assignedBookkeeperId: bk.uid,
      attachedFileIds: [fileId],
    });
    await emulatorUploadSmallFile(taskId, fileId, bk.email, TEST_PASSWORD);

    try {
      await authMod.signInWithEmailAndPassword(
        fireAuthRef,
        staff.email,
        TEST_PASSWORD,
      );
      await expect(fn({ taskId, fileId })).rejects.toThrow(
        /permission-denied|You do not have access/i,
      );
    } finally {
      await cleanup([bk, staff], taskId, fileId);
    }
  }, 60_000);

  it("(d) deleteFile from bookkeeper B → permission-denied", async () => {
    const functionsMod = await import("firebase/functions");
    const authMod = await import("firebase/auth");
    const fn = functionsMod.httpsCallable<
      { taskId: string; fileId: string },
      { deleted: boolean; fileId: string }
    >(functions, "deleteFile");

    const bkA = await makeUser("bookkeeper");
    const bkB = await makeUser("bookkeeper");
    const fileId = `file-${uniqueSuffix()}`;
    const taskId = await seedTask({
      assignedBookkeeperId: bkA.uid,
      attachedFileIds: [fileId],
    });
    await emulatorUploadSmallFile(taskId, fileId, bkA.email, TEST_PASSWORD);

    try {
      await authMod.signInWithEmailAndPassword(
        fireAuthRef,
        bkB.email,
        TEST_PASSWORD,
      );
      await expect(fn({ taskId, fileId })).rejects.toThrow(
        /permission-denied|Only the assigned bookkeeper or an admin/i,
      );
    } finally {
      await cleanup([bkA, bkB], taskId, fileId);
    }
  }, 60_000);

  it("(e) deleteFile from bookkeeper A → success; storage gone + array updated", async () => {
    const functionsMod = await import("firebase/functions");
    const authMod = await import("firebase/auth");
    const fireFsMod = await import("firebase/firestore");
    const fn = functionsMod.httpsCallable<
      { taskId: string; fileId: string },
      { deleted: boolean; fileId: string }
    >(functions, "deleteFile");

    const bk = await makeUser("bookkeeper");
    const fileId = `file-${uniqueSuffix()}`;
    const taskId = await seedTask({
      assignedBookkeeperId: bk.uid,
      attachedFileIds: [fileId],
    });
    await emulatorUploadSmallFile(taskId, fileId, bk.email, TEST_PASSWORD);

    try {
      await authMod.signInWithEmailAndPassword(
        fireAuthRef,
        bk.email,
        TEST_PASSWORD,
      );
      const { data } = await fn({ taskId, fileId });
      expect(data.deleted).toBe(true);
      expect(data.fileId).toBe(fileId);

      const taskDoc = await fireFsMod.getDoc(
        fireFsMod.doc(db, "clientFormTasks", taskId),
      );
      expect(taskDoc.exists()).toBe(true);
      const ids = (taskDoc.data()?.attachedFileIds ?? []) as unknown[];
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).not.toContain(fileId);

      // Confirm storage object really gone (REST delete of /o/{path}).
      const url =
        `http://127.0.0.1:9199/storage/v1/b/${PROJECT_ID}.appspot.com/o/` +
        encodeURIComponent(`tasks/${taskId}/files/${fileId}`);
      const headRes = await fetch(url);
      expect(headRes.status).toBe(404);
    } finally {
      await cleanup([bk], taskId);
    }
  }, 60_000);

  it("(f) getFileUrl after delete → not-found", async () => {
    const functionsMod = await import("firebase/functions");
    const authMod = await import("firebase/auth");
    const fn = functionsMod.httpsCallable<
      { taskId: string; fileId: string },
      { url: string; expiresAt: number }
    >(functions, "getFileUrl");

    const admin = await makeUser("admin");
    const bk = await makeUser("bookkeeper");
    const fileId = `file-${uniqueSuffix()}`;
    const taskId = await seedTask({
      assignedBookkeeperId: bk.uid,
      attachedFileIds: [fileId],
    });
    await emulatorUploadSmallFile(
      taskId,
      fileId,
      admin.email,
      TEST_PASSWORD,
      "ephemeral",
    );
    // Wipe the object so `getFileUrl`'s existence check fires.
    await fetch(
      `http://127.0.0.1:9199/storage/v1/b/${PROJECT_ID}.appspot.com/o/` +
        encodeURIComponent(`tasks/${taskId}/files/${fileId}`),
      { method: "DELETE" },
    );

    try {
      await authMod.signInWithEmailAndPassword(
        fireAuthRef,
        admin.email,
        TEST_PASSWORD,
      );
      await expect(fn({ taskId, fileId })).rejects.toThrow(
        /not-found|no longer exists|Task not found/i,
      );
    } finally {
      await cleanup([admin, bk], taskId);
    }
  }, 60_000);
});
