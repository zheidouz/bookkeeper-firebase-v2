// Cloud Functions v2 entrypoint.
// Slice #5: exports the user-management callables.
// Slice #4: exports the BIR holiday seeder.
// Slice #10: exports the archiveTask callable.

import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-southeast1" });

export { adminCreateUser } from "./adminCreateUser.js";
export { assignRole } from "./assignRole.js";
export { seedBirHolidays } from "./seedBirHolidays.js";
export { archiveTask } from "./archiveTask.js";