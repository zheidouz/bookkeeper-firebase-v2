// Cloud Function: assignRole
//
// Callable — admin-only. Updates the role custom claim and the
// users/{uid} document. Two writes (auth + Firestore) — idempotent enough
// for an admin tool. If the doc is missing, we create it so the list view
// stays consistent.

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { userRoleSchema, type UserRoleInput } from "./zodSchemas.js";

// See adminCreateUser.ts — emulator runtime requires explicit init.
if (!getApps().length) {
  initializeApp();
}

interface AssignRoleResponse {
  uid: string;
  role: UserRoleInput["role"];
}

export const assignRole = onCall(
  { region: "asia-southeast1" },
  async (
    request: CallableRequest<UserRoleInput>,
  ): Promise<AssignRoleResponse> => {
    if (request.auth?.token.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can change user roles.",
      );
    }

    const parsed = userRoleSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
    }
    const { uid, role } = parsed.data;

    const auth = getAuth();
    const db = getFirestore();

    await auth.setCustomUserClaims(uid, { role });
    const ref = db.doc(`users/${uid}`);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({
        role,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Backfill — the row might not exist if the user was created out of
      // band (e.g. Firebase console). Admin override is intentional.
      await ref.set(
        {
          email: snap.get("email") ?? null,
          name: snap.get("name") ?? null,
          role,
          status: "active",
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    return { uid, role };
  },
);