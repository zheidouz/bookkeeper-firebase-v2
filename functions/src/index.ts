// Cloud Functions v2 entrypoint.
// Slice #5: exports the user-management callables.

import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-southeast1" });

export { adminCreateUser } from "./adminCreateUser.js";
export { assignRole } from "./assignRole.js";