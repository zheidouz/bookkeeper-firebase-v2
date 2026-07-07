/**
 * Integration tests for the consolidated role × collection × action
 * matrix in `firestore.rules` (slice #17).
 *
 * Skipped unless `VITE_USE_EMULATOR === "true"` (set by the
 * `test:integration` npm script via firebase-tools emulators:exec).
 *
 * Test naming follows the issue brief:
 *   `<role>-<collection>-<action>-<expected>`
 * e.g. "staff-tasks-update-status-denied".
 *
 * Each `it`:
 *   1. Seeds the required precondition docs (via Admin SDK, bypassing
 *      rules).
 *   2. Signs in as the role under test (via the client SDK).
 *   3. Attempts the action via the client SDK and asserts whether
 *      the operation succeeded or threw a `permission-denied`.
 *
 * The matrix below is the authoritative version of the slice #17
 * role table — if any cell flips, update the table here AND the
 * helpers + per-collection rules in `firestore.rules`.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { signInWithEmailAndPassword, signOut, signOut as fbSignOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Timestamp as AdminTimestamp,
  FieldValue as AdminFieldValue,
} from "firebase-admin/firestore";
import {
  initializeApp as initAdminApp,
  applicationDefault,
  deleteApp as deleteAdminApp,
  type App as AdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

setLogLevel("error");

import { auth, db } from "@/lib/firebaseConfig";

const PROJECT_ID = "demo-bookkeeper";
const TEST_PASSWORD = "test-password-123";

const RUN_INTEGRATION = process.env.VITE_USE_EMULATOR === "true";

const uniqueSuffix = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

const describeIf = RUN_INTEGRATION ? describe : describe.skip;

describeIf("rules matrix — slice #17 role × collection × action", () => {
  let adminApp: AdminApp;

  beforeAll(() => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    process.env.GCLOUD_PROJECT = PROJECT_ID;

    adminApp = initAdminApp(
      { projectId: PROJECT_ID, credential: applicationDefault() },
      "rules-matrix-admin",
    );
    expect(auth).toBeDefined();
    expect(db).toBeDefined();
  }, 15_000);

  afterAll(async () => {
    if (adminApp) {
      try {
        await deleteAdminApp(adminApp);
      } catch {
        /* no-op */
      }
    }
  });

  beforeEach(async () => {
    try {
      await signOut(auth);
    } catch {
      /* no-op */
    }
  });

  /** Create an Auth user with a role custom claim, returning
   *  `{ uid, email }`. */
  async function makeUser(
    role: "admin" | "bookkeeper" | "staff",
  ): Promise<{ uid: string; email: string }> {
    const adminAuth = getAdminAuth(adminApp);
    const email = `${role}-${uniqueSuffix()}@example.com`;
    const rec = await adminAuth.createUser({
      email,
      password: TEST_PASSWORD,
    });
    await adminAuth.setCustomUserClaims(rec.uid, { role });
    return { uid: rec.uid, email };
  }

  /** Seed a minimal `users/{uid}` doc (avatar, name). */
  async function seedUserDoc(
    uid: string,
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    const adminDb = getAdminFirestore(adminApp);
    await adminDb
      .collection("users")
      .doc(uid)
      .set(
        {
          email: `${uid}@example.com`,
          displayName: "Test User",
          role: "bookkeeper",
          createdAt: AdminTimestamp.now(),
          updatedAt: AdminTimestamp.now(),
          ...overrides,
          },
          { merge: true },
          );
          }

          /** Seed an active `clients/{clientId}` doc with a default shape. */
  async function seedClientDoc(
    assignedBookkeeperId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const adminDb = getAdminFirestore(adminApp);
    const ref = adminDb.collection("clients").doc();
    await ref.set(
      {
        businessName: `Acme-${uniqueSuffix()}`,
        ownerName: "Jane Doe",
        tin: "123-456-789",
        rdo: "047",
        address: "QC",
        contactNumber: "+63 917 123 4567",
        email: `client-${uniqueSuffix()}@example.com`,
        assignedBookkeeperId,
        status: "active",
        notes: "",
        createdAt: AdminTimestamp.now(),
        updatedAt: AdminTimestamp.now(),
        ...overrides,
      },
      { merge: true },
    );
    return ref.id;
  }

  /** Seed an active `clientFormTasks/{taskId}` doc. */
  async function seedTaskDoc(
    assignedBookkeeperId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const adminDb = getAdminFirestore(adminApp);
    const ref = adminDb.collection("clientFormTasks").doc();
    await ref.set(
      {
        clientId: `client-${uniqueSuffix()}`,
        taxFormId: `form-${uniqueSuffix()}`,
        assignedBookkeeperId,
        frequency: "monthly",
        status: "pending",
        archived: false,
        notes: "",
        attachedFileIds: [],
        attachedFileMeta: {},
        createdAt: AdminTimestamp.now(),
        updatedAt: AdminTimestamp.now(),
        ...overrides,
      },
      { merge: true },
    );
    return ref.id;
  }

  /** Seed a `taskStatusHistory/{id}` doc (pending → ready_to_file). */
  async function seedHistoryRow(taskId: string) {
    const adminDb = getAdminFirestore(adminApp);
    const ref = adminDb.collection("taskStatusHistory").doc();
    await ref.set({
      taskId,
      oldStatus: "pending",
      newStatus: "ready_to_file",
      changedBy: "tester",
      changedAt: AdminTimestamp.now(),
      notes: "",
    });
    return ref.id;
  }

  /** Seed a `birHolidays/2026` doc. */
  async function seedHolidaysDoc(year = 2026) {
    const adminDb = getAdminFirestore(adminApp);
    const ref = adminDb.collection("birHolidays").doc(String(year));
    await ref.set({
      year,
      holidays: ["2026-04-09", "2026-04-10"],
    });
    return ref.id;
  }

  /** Convenience: sign-in-and-run an action under the role's
   *  authenticated client. Sign-out happens in the caller's
   *  `finally`, NOT here. To assert a data result, do the read
   *  INSIDE the callback — the auth context is still live.
   *
   * Usage:
   *   await asUser(user, async () => {
   *     await setDoc(...);
   *     const snap = await getDoc(...);   // session still active
   *     expect(...).toBe(true);
   *   });
   */
  async function asUser<T>(
    user: { email: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    await signInWithEmailAndPassword(auth, user.email, TEST_PASSWORD);
    try {
      return await fn();
    } finally {
      try {
        await fbSignOut(auth);
      } catch {
        /* no-op */
      }
    }
  }

  // ── USERS ───────────────────────────────────────────────────
  describe("users collection", () => {
    it("admin-users-create-allowed", async () => {
      const admin = await makeUser("admin");
      const newUid = `new-${uniqueSuffix()}`;
      try {
        await asUser(admin, async () => {
          await setDoc(doc(db, "users", newUid), {
            email: "new@x.com",
            displayName: "New",
            role: "staff",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          const snap = await getDoc(doc(db, "users", newUid));
          expect(snap.exists()).toBe(true);
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(admin.uid);
      }
    }, 30_000);

    it("bookkeeper-users-create-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const newUid = `new-${uniqueSuffix()}`;
      try {
        await asUser(bk, async () => {
          await expect(
            setDoc(doc(db, "users", newUid), {
              email: "x@x.com",
              displayName: "X",
              role: "staff",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("admin-users-delete-allowed", async () => {
      const admin = await makeUser("admin");
      const target = await makeUser("bookkeeper");
      await seedUserDoc(target.uid);
      try {
        await asUser(admin, async () => {
          await deleteDoc(doc(db, "users", target.uid));
        });
        const adminDb = getAdminFirestore(adminApp);
        const snap = await adminDb
          .collection("users")
          .doc(target.uid)
          .get();
        expect(snap.exists).toBe(false);
      } finally {
        await getAdminAuth(adminApp).deleteUser(admin.uid);
        await getAdminAuth(adminApp).deleteUser(target.uid).catch(() => undefined);
      }
    }, 30_000);

    it("bookkeeper-users-delete-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const target = await makeUser("staff");
      await seedUserDoc(target.uid);
      try {
        await asUser(bk, async () => {
          await expect(
            deleteDoc(doc(db, "users", target.uid)),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(bk.uid);
        await getAdminAuth(adminApp).deleteUser(target.uid).catch(() => undefined);
      }
    }, 30_000);

    it("self-users-update-own-allowed", async () => {
      const target = await makeUser("staff");
      await seedUserDoc(target.uid, { displayName: "Initial" });
      try {
        await asUser(target, async () => {
          await updateDoc(doc(db, "users", target.uid), {
            displayName: "Updated",
          });
        });
        const adminDb = getAdminFirestore(adminApp);
        const snap = await adminDb
          .collection("users")
          .doc(target.uid)
          .get();
        expect(snap.data()?.displayName).toBe("Updated");
      } finally {
        await getAdminAuth(adminApp).deleteUser(target.uid);
      }
    }, 30_000);

    it("staff-users-read-other-denied", async () => {
      const me = await makeUser("staff");
      const other = await makeUser("bookkeeper");
      await seedUserDoc(other.uid);
      try {
        await asUser(me, async () => {
          let caught = "";
          try {
            await getDoc(doc(db, "users", other.uid));
          } catch (err) {
            caught = err instanceof Error ? err.message : String(err);
          }
          expect(caught).toMatch(/permission|insufficient|false for|denied/i);
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(me.uid);
        await getAdminAuth(adminApp).deleteUser(other.uid);
      }
    }, 30_000);
  });

  // ── TAX FORMS ───────────────────────────────────────────────
  describe("taxForms collection", () => {
    it("staff-taxforms-create-denied", async () => {
      const staff = await makeUser("staff");
      try {
        await asUser(staff, async () => {
          await expect(
            addDoc(collection(db, "taxForms"), {
              formCode: "X",
              formName: "X",
              description: "",
              category: "VAT",
              defaultFrequency: "monthly",
              defaultDeadlineRule: "fixedDayOfMonthAfterPeriod",
              deadlineShift: 10,
              isActive: true,
              seedSource: false,
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);

    it("bookkeeper-taxforms-update-allowed", async () => {
      const bk = await makeUser("bookkeeper");
      const adminDb = getAdminFirestore(adminApp);
      const ref = await adminDb.collection("taxForms").add({
        formCode: "T",
        formName: "T",
        description: "",
        category: "VAT",
        defaultFrequency: "monthly",
        defaultDeadlineRule: "fixedDayOfMonthAfterPeriod",
        deadlineShift: 10,
        isActive: true,
        seedSource: false,
      });
      try {
        await asUser(bk, async () => {
          await updateDoc(doc(db, "taxForms", ref.id), {
            description: "Updated",
          });
        });
        const snap = await adminDb
          .collection("taxForms")
          .doc(ref.id)
          .get();
        expect(snap.data()?.description).toBe("Updated");
      } finally {
        await adminDb.collection("taxForms").doc(ref.id).delete();
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);
  });

  // ── CLIENTS ─────────────────────────────────────────────────
  describe("clients collection", () => {
    it("clients-archived-read-staff-denied", async () => {
      const staff = await makeUser("staff");
      const bk = await makeUser("bookkeeper");
      const archived = await seedClientDoc(bk.uid, { status: "archived" });
      try {
        await asUser(staff, async () => {
          let caught = "";
          try {
            await getDoc(doc(db, "clients", archived));
          } catch (err) {
            caught = err instanceof Error ? err.message : String(err);
          }
          expect(caught).toMatch(/permission|insufficient|false for|denied/i);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clients")
          .doc(archived)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(staff.uid);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("clients-archived-read-admin-allowed", async () => {
      const admin = await makeUser("admin");
      const bk = await makeUser("bookkeeper");
      const archived = await seedClientDoc(bk.uid, { status: "archived" });
      try {
        await asUser(admin, async () => {
          const snap = await getDoc(doc(db, "clients", archived));
          expect(snap.exists()).toBe(true);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clients")
          .doc(archived)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(admin.uid);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("staff-clients-create-denied", async () => {
      const staff = await makeUser("staff");
      try {
        await asUser(staff, async () => {
          await expect(
            addDoc(collection(db, "clients"), {
              businessName: "X",
              ownerName: "X",
              tin: "X",
              rdo: "X",
              address: "X",
              contactNumber: "X",
              email: "x@x.com",
              assignedBookkeeperId: staff.uid,
              status: "active",
              notes: "",
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);
  });

  // ── clientFormTasks ─────────────────────────────────────────
  describe("clientFormTasks collection", () => {
    it("admin-tasks-create-allowed", async () => {
      const admin = await makeUser("admin");
      try {
        await asUser(admin, async () => {
          await addDoc(collection(db, "clientFormTasks"), {
            clientId: "c",
            taxFormId: "f",
            assignedBookkeeperId: admin.uid,
            frequency: "monthly",
            status: "pending",
            archived: false,
            notes: "",
            attachedFileIds: [],
            attachedFileMeta: {},
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(admin.uid);
      }
    }, 30_000);

    it("assigned-bookkeeper-tasks-update-status-allowed", async () => {
      const bk = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bk.uid);
      try {
        await asUser(bk, async () => {
          await updateDoc(doc(db, "clientFormTasks", taskId), {
            status: "ready_to_file",
            updatedAt: serverTimestamp(),
          });
        });
        const snap = await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .get();
        expect(snap.data()?.status).toBe("ready_to_file");
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("other-bookkeeper-tasks-update-denied", async () => {
      const bkA = await makeUser("bookkeeper");
      const bkB = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bkA.uid);
      try {
        await asUser(bkB, async () => {
          await expect(
            updateDoc(doc(db, "clientFormTasks", taskId), {
              status: "ready_to_file",
              updatedAt: serverTimestamp(),
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bkA.uid);
        await getAdminAuth(adminApp).deleteUser(bkB.uid);
      }
    }, 30_000);

    it("staff-tasks-update-notes-allowed", async () => {
      const bk = await makeUser("bookkeeper");
      const staff = await makeUser("staff");
      const taskId = await seedTaskDoc(bk.uid);
      try {
        await asUser(staff, async () => {
          await updateDoc(doc(db, "clientFormTasks", taskId), {
            notes: "staff note",
            updatedAt: serverTimestamp(),
          });
        });
        const snap = await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .get();
        expect(snap.data()?.notes).toBe("staff note");
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);

    it("staff-tasks-update-status-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const staff = await makeUser("staff");
      const taskId = await seedTaskDoc(bk.uid);
      try {
        await asUser(staff, async () => {
          await expect(
            updateDoc(doc(db, "clientFormTasks", taskId), {
              status: "ready_to_file",
              updatedAt: serverTimestamp(),
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);

    it("staff-tasks-update-assignedBookkeeperId-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const staff = await makeUser("staff");
      const taskId = await seedTaskDoc(bk.uid);
      try {
        await asUser(staff, async () => {
          await expect(
            updateDoc(doc(db, "clientFormTasks", taskId), {
              assignedBookkeeperId: staff.uid,
              updatedAt: serverTimestamp(),
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);

    it("staff-tasks-update-archive-flag-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const staff = await makeUser("staff");
      const taskId = await seedTaskDoc(bk.uid);
      try {
        await asUser(staff, async () => {
          await expect(
            updateDoc(doc(db, "clientFormTasks", taskId), {
              archived: true,
              updatedAt: serverTimestamp(),
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);

    it("client-direct-archive-status-redirect-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bk.uid, { status: "done" });
      try {
        await asUser(bk, async () => {
          await expect(
            updateDoc(doc(db, "clientFormTasks", taskId), {
              status: "archived",
              updatedAt: serverTimestamp(),
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("admin-tasks-update-archived-allowed", async () => {
      const admin = await makeUser("admin");
      const taskId = await seedTaskDoc(admin.uid, {
        archived: true,
        status: "archived",
      });
      try {
        await asUser(admin, async () => {
          await updateDoc(doc(db, "clientFormTasks", taskId), {
            notes: "admin-archived-update",
            updatedAt: serverTimestamp(),
          });
        });
        const snap = await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .get();
        expect(snap.data()?.notes).toBe("admin-archived-update");
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(admin.uid);
      }
    }, 30_000);

    it("bookkeeper-tasks-update-archived-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bk.uid, {
        archived: true,
        status: "archived",
      });
      try {
        await asUser(bk, async () => {
          await expect(
            updateDoc(doc(db, "clientFormTasks", taskId), {
              notes: "should not write",
              updatedAt: serverTimestamp(),
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("bookkeeper-encoder-notes-create-allowed-assigned", async () => {
      const bk = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bk.uid);
      try {
        await asUser(bk, async () => {
          await addDoc(
            collection(db, "clientFormTasks", taskId, "encoderNotes"),
            {
              text: "note",
              createdBy: bk.uid,
              createdAt: serverTimestamp(),
            },
          );
          const snap = await getDocs(
            query(collection(db, "clientFormTasks", taskId, "encoderNotes")),
          );
          expect(snap.size).toBeGreaterThan(0);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);
  });

  // ── taskStatusHistory ───────────────────────────────────────
  describe("taskStatusHistory collection", () => {
    it("bookkeeper-history-create-allowed", async () => {
      const bk = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bk.uid);
      try {
        await asUser(bk, async () => {
          await addDoc(collection(db, "taskStatusHistory"), {
            taskId,
            oldStatus: "pending",
            newStatus: "ready_to_file",
            changedBy: bk.uid,
            changedAt: serverTimestamp(),
            notes: "",
          });
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("history-update-immutable-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bk.uid);
      const adminDb = getAdminFirestore(adminApp);
      const histRef = adminDb.collection("taskStatusHistory").doc();
      await histRef.set({
        taskId,
        oldStatus: "pending",
        newStatus: "ready_to_file",
        changedBy: bk.uid,
        changedAt: AdminTimestamp.now(),
        notes: "",
      });
      try {
        await asUser(bk, async () => {
          await expect(
            updateDoc(doc(db, "taskStatusHistory", histRef.id), {
              notes: "tamper",
            }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await adminDb.collection("taskStatusHistory").doc(histRef.id).delete();
        await adminDb
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("history-delete-immutable-denied", async () => {
      const bk = await makeUser("bookkeeper");
      const taskId = await seedTaskDoc(bk.uid);
      const adminDb = getAdminFirestore(adminApp);
      const histRef = adminDb.collection("taskStatusHistory").doc();
      await histRef.set({
        taskId,
        oldStatus: "pending",
        newStatus: "ready_to_file",
        changedBy: bk.uid,
        changedAt: AdminTimestamp.now(),
        notes: "",
      });
      try {
        await asUser(bk, async () => {
          await expect(
            deleteDoc(doc(db, "taskStatusHistory", histRef.id)),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await adminDb.collection("taskStatusHistory").doc(histRef.id).delete();
        await adminDb
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(bk.uid);
      }
    }, 30_000);

    it("admin-history-delete-still-denied", async () => {
      const admin = await makeUser("admin");
      const taskId = await seedTaskDoc(admin.uid);
      const adminDb = getAdminFirestore(adminApp);
      const histRef = adminDb.collection("taskStatusHistory").doc();
      await histRef.set({
        taskId,
        oldStatus: "pending",
        newStatus: "ready_to_file",
        changedBy: admin.uid,
        changedAt: AdminTimestamp.now(),
        notes: "",
      });
      try {
        await asUser(admin, async () => {
          await expect(
            deleteDoc(doc(db, "taskStatusHistory", histRef.id)),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await adminDb.collection("taskStatusHistory").doc(histRef.id).delete();
        await adminDb
          .collection("clientFormTasks")
          .doc(taskId)
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(admin.uid);
      }
    }, 30_000);
  });

  // ── birHolidays ─────────────────────────────────────────────
  describe("birHolidays collection", () => {
    it("staff-birholidays-read-allowed", async () => {
      const staff = await makeUser("staff");
      await seedHolidaysDoc(2026);
      try {
        await asUser(staff, async () => {
          const snap = await getDoc(doc(db, "birHolidays", "2026"));
          expect(snap.exists()).toBe(true);
        });
      } finally {
        await getAdminFirestore(adminApp)
          .collection("birHolidays")
          .doc("2026")
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);

    it("staff-birholidays-write-denied", async () => {
      const staff = await makeUser("staff");
      try {
        await asUser(staff, async () => {
          await expect(
            setDoc(doc(db, "birHolidays", "2026"), { year: 2026 }),
          ).rejects.toThrow(/permission/i);
        });
      } finally {
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);

    it("admin-birholidays-write-allowed", async () => {
      const admin = await makeUser("admin");
      try {
        await asUser(admin, async () => {
          await setDoc(doc(db, "birHolidays", "2027"), {
            year: 2027,
            holidays: [],
          });
        });
        const adminDb = getAdminFirestore(adminApp);
        const snap = await adminDb
          .collection("birHolidays")
          .doc("2027")
          .get();
        expect(snap.exists).toBe(true);
      } finally {
        await getAdminFirestore(adminApp)
          .collection("birHolidays")
          .doc("2027")
          .delete()
          .catch(() => undefined);
        await getAdminAuth(adminApp).deleteUser(admin.uid);
      }
    }, 30_000);
  });

  // ── Default deny ────────────────────────────────────────────
  describe("default deny", () => {
    it("anon-tasks-read-denied", async () => {
      // Pre-seeded read attempt without signing in. Emulator
      // returns `auth/` or `permission-denied` code; for an
      // unauthenticated list, the rules engine emits the
      // `false for 'list'` denial with a specific message that
      // starts with "Some requested document was not found", or
      // "Missing or insufficient permissions" for create/get.
      let caught = "";
      try {
        await getDocs(query(collection(db, "clientFormTasks")));
      } catch (err) {
        caught = err instanceof Error ? err.message : String(err);
      }
      expect(caught).toMatch(
        /permission|insufficient|missing|false for|auth/i,
      );
    }, 30_000);

    it("staff-unknown-collection-read-denied", async () => {
      const staff = await makeUser("staff");
      try {
        let caught = "";
        try {
          await asUser(staff, async () => {
            await getDocs(query(collection(db, "doesNotExist")));
          });
        } catch (err) {
          caught = err instanceof Error ? err.message : String(err);
        }
        expect(caught).toMatch(
          /permission|insufficient|missing|false for|not found/i,
        );
      } finally {
        await getAdminAuth(adminApp).deleteUser(staff.uid);
      }
    }, 30_000);
  });
});
