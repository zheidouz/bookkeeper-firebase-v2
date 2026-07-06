// Cloud Function: adminCreateUser
//
// Callable — admin-only. Uses Firebase Admin SDK to:
//   1. create an Auth account
//   2. set the role custom claim
//   3. write users/{uid} with the canonical shape
//   4. generate and return a one-time password-reset link
//
// The link is generated server-side and returned over the callable response,
// never logged. Clients display it inside a copy-to-clipboard Card.

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { userCreateSchema, type UserCreateInput } from "./zodSchemas.js";

// The Firebase Functions emulator runtime does NOT auto-initialize the
// Admin SDK (unlike deployed Functions). Guard with getApps() so we
// self-init once per cold start. Production deploys are no-ops because
// the SDK is auto-initialized before the first invocation.
if (!getApps().length) {
  initializeApp();
}

interface AdminCreateUserResponse {
  uid: string;
  passwordResetLink: string;
}

export const adminCreateUser = onCall(
  { region: "asia-southeast1" },
  async (
    request: CallableRequest<UserCreateInput>,
  ): Promise<AdminCreateUserResponse> => {
    if (request.auth?.token.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can create users.",
      );
    }

    const parsed = userCreateSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
    }
    const { email, displayName, role } = parsed.data;

    const auth = getAuth();
    const db = getFirestore();

    let userRecord;
    try {
      userRecord = await auth.createUser({ email, displayName });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "auth/email-already-exists") {
        throw new HttpsError(
          "already-exists",
          "A user with that email already exists.",
        );
      }
      throw new HttpsError(
        "internal",
        "Failed to create the Auth account.",
      );
    }

    await auth.setCustomUserClaims(userRecord.uid, { role });

    await db.doc(`users/${userRecord.uid}`).set({
      name: displayName,
      email,
      role,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    let passwordResetLink: string;
    try {
      passwordResetLink = await auth.generatePasswordResetLink(email);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to generate password reset link.";
      throw new HttpsError("internal", message);
    }

    return { uid: userRecord.uid, passwordResetLink };
  },
);