import "@testing-library/jest-dom/vitest";

// Stub import.meta.env.VITE_USE_EMULATOR for unit tests so that importing
// @/lib/firebaseConfig does NOT auto-connect to a real Firebase project.
// (firebaseConfig only connects when the flag is exactly "true".)
const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
if (env && env.VITE_USE_EMULATOR === undefined) {
  env.VITE_USE_EMULATOR = "false";
}