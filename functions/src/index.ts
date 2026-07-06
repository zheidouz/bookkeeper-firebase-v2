// Cloud Functions v2 entrypoint.
// Slice #5: exports the user-management callables.
// Slice #4: exports the BIR holiday seeder.
// Slice #10: exports the archiveTask callable.
// Slice #11: exports the nightly reconciliation scheduled function.

import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-southeast1" });

export { adminCreateUser } from "./adminCreateUser.js";
export { assignRole } from "./assignRole.js";
export { seedBirHolidays } from "./seedBirHolidays.js";
export { archiveTask } from "./archiveTask.js";
export { reconcileOverdueArchives } from "./reconcileOverdueArchives.js";
