import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";

/**
 * Firebase web SDK initialization.
 *
 * Reads VITE_USE_EMULATOR=true → points the SDK at the local emulator suite
 * on 127.0.0.1 (Auth :9099, Firestore :8080, Storage :9199). No real project
 * or API key required in that mode.
 *
 * When VITE_USE_EMULATOR is anything else, reads real config from
 * VITE_FIREBASE_* env vars. Real values live in .env.local (gitignored).
 */

const useEmulator = import.meta.env.VITE_USE_EMULATOR === "true";

const firebaseConfig = useEmulator
  ? {
      // Dummy config — emulators don't validate these against a real project.
      apiKey: "demo-api-key",
      authDomain: "demo-bookkeeper.firebaseapp.com",
      projectId: "demo-bookkeeper",
      storageBucket: "demo-bookkeeper.appspot.com",
      messagingSenderId: "0",
      appId: "1:0:web:000000000000",
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
      appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
    };

const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

if (useEmulator && typeof window !== "undefined") {
  // Idempotent — connectXEmulator throws if called twice on the same instance.
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  } catch {
    /* already connected */
  }
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch {
    /* already connected */
  }
  try {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  } catch {
    /* already connected */
  }
}

export default app;