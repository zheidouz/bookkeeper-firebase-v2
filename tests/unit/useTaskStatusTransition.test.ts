// Unit tests for useTaskStatusTransition.transitionTaskStatus
// (slice #9). Verifies the batched-write path:
//
//   1. illegal transitions throw before any write is opened
//   2. legal transitions call batch.update(taskRef, ...),
//      batch.set(historyRef, ...), and batch.commit() — in that order
//   3. notes default to "" when not provided (so an empty note still
//      appends a row)
//   4. the history row carries oldStatus / newStatus / changedBy /
//      changedAt / taskId / notes exactly as specified
//
// We mock the firebase/firestore module so the test doesn't talk to
// any real or emulator-hosted Firestore. Production callers use the
// default db; this test passes a stub that captures the calls.

import { afterEach, describe, expect, it, vi } from "vitest";

// --- Mock firebase/firestore ---------------------------------------
// The test asserts the shape of the calls, not the SDK behaviour, so
// we replace the module with hand-rolled spies.
//
// `vi.hoisted` keeps the spy factories above the vi.mock call site
// (vi.mock is hoisted to the top of the file at transform time).
const spies = vi.hoisted(() => {
  return {
    firestoreInstance: { __name: "stub-firestore" } as unknown,
    updateCalls: [] as Array<{
      ref: { path: string };
      data: Record<string, unknown>;
    }>,
    setCalls: [] as Array<{
      ref: { path: string; id: string };
      data: Record<string, unknown>;
    }>,
    commitCalls: 0,
    serverTimestampCalls: 0,
  };
});

vi.mock("firebase/firestore", () => {
  const serverTimestamp = () => {
    spies.serverTimestampCalls += 1;
    return { __type: "serverTimestamp" };
  };

  // doc(...) overloads — distinguish (collection) auto-id from
  // (firestore, collection, id) explicit ref via arg shape.
  function doc(...args: unknown[]) {
    // doc(collectionResult) — auto-id history ref
    if (args.length === 1 && args[0] && typeof args[0] === "object") {
      return {
        id: "HISTORY_AUTO_ID_1",
        path: "taskStatusHistory/HISTORY_AUTO_ID_1",
      };
    }
    // doc(firestore, collection, id)
    const [_, collection, id] = args as [unknown, string, string];
    return { id, path: `${collection}/${id}` };
  }

  function collection(_firestore: unknown, name: string) {
    return { id: name, path: name };
  }

  function writeBatch(firestore: unknown) {
    const batch = {
      update(
        ref: { path: string },
        data: Record<string, unknown>,
      ) {
        spies.updateCalls.push({ ref, data });
        return batch;
      },
      set(
        ref: { path: string; id: string },
        data: Record<string, unknown>,
      ) {
        spies.setCalls.push({ ref, data });
        return batch;
      },
      async commit() {
        spies.commitCalls += 1;
      },
    };
    void firestore;
    return batch;
  }

  return {
    doc,
    collection,
    writeBatch,
    serverTimestamp,
  };
});

// Stub the real firebaseConfig so the production `db` object is a
// plain marker — we never use it in these tests (the test passes
// its own firestore to transitionTaskStatus) and avoiding the real
// Firebase init keeps the auth/invalid-api-key error out.
vi.mock("@/lib/firebaseConfig", () => ({
  db: { __name: "production-db-stub" },
  auth: { __name: "production-auth-stub" },
  storage: {},
  functions: {},
  default: {},
}));

import {
  IllegalStatusTransitionError,
  transitionTaskStatus,
} from "@/features/clientFormTasks/useTaskStatusTransition";

// ------------------------------------------------------------------

afterEach(() => {
  spies.updateCalls.length = 0;
  spies.setCalls.length = 0;
  spies.commitCalls = 0;
  spies.serverTimestampCalls = 0;
});

describe("transitionTaskStatus", () => {
  it("rejects an illegal jump (pending → done) before opening any write", async () => {
    await expect(
      transitionTaskStatus({
        taskId: "task-1",
        fromStatus: "pending",
        toStatus: "done",
        changedBy: "bkA",
        notes: "skip steps",
      }),
    ).rejects.toBeInstanceOf(IllegalStatusTransitionError);

    expect(spies.updateCalls).toEqual([]);
    expect(spies.setCalls).toEqual([]);
    expect(spies.commitCalls).toBe(0);
  });

  it("rejects a backward transition (submitted → ready_to_file)", async () => {
    await expect(
      transitionTaskStatus({
        taskId: "task-2",
        fromStatus: "submitted",
        toStatus: "ready_to_file",
        changedBy: "bkA",
      }),
    ).rejects.toBeInstanceOf(IllegalStatusTransitionError);
    expect(spies.commitCalls).toBe(0);
  });

  it("writes task update + history set + commit for a legal transition", async () => {
    await transitionTaskStatus({
      taskId: "task-3",
      fromStatus: "pending",
      toStatus: "ready_to_file",
      changedBy: "bkA",
      notes: "starting Q1 prep",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateCalls = spies.updateCalls.map((c) => ({
      path: c.ref.path,
      data: c.data,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setCalls = spies.setCalls.map((c) => ({
      path: c.ref.path,
      id: c.ref.id,
      data: c.data,
    }));
    expect(updateCalls).toEqual([
      {
        path: "clientFormTasks/task-3",
        data: { status: "ready_to_file", updatedAt: { __type: "serverTimestamp" } },
      },
    ]);
    expect(setCalls).toEqual([
      {
        path: "taskStatusHistory/HISTORY_AUTO_ID_1",
        id: "HISTORY_AUTO_ID_1",
        data: {
          taskId: "task-3",
          oldStatus: "pending",
          newStatus: "ready_to_file",
          changedBy: "bkA",
          changedAt: { __type: "serverTimestamp" },
          notes: "starting Q1 prep",
        },
      },
    ]);
    expect(spies.commitCalls).toBe(1);
    expect(spies.serverTimestampCalls).toBe(2);
  });

  it("still appends a history row when notes are omitted (defaults to '')", async () => {
    await transitionTaskStatus({
      taskId: "task-4",
      fromStatus: "ready_to_file",
      toStatus: "submitted",
      changedBy: "bkA",
    });

    expect(spies.setCalls.length).toBe(1);
    const row = spies.setCalls[0].data;
    expect(row.notes).toBe("");
    expect(row.oldStatus).toBe("ready_to_file");
    expect(row.newStatus).toBe("submitted");
    expect(row.changedBy).toBe("bkA");
  });
});
