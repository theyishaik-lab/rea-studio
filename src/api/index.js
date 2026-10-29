import { liveApi } from "./live.js";
import { demoApi } from "./demo.js";

// __DEMO__ is a build-time constant, so the live build tree-shakes the demo data away.
export const api = __DEMO__ ? demoApi : liveApi;
