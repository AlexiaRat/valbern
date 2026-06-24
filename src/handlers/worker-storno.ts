// SQS worker — storno / invoice reversal (§3), also fed by the RMA flow. P0 skeleton; auto-storno + SPV confirm land in P3.
import { makeWorker } from "../worker/run.js";
export const handler = makeWorker("storno");
