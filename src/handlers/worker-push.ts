// SQS worker — availability push to channels (§3). P0 skeleton; computeAvailable push lands in P1.
import { makeWorker } from "../worker/run.js";
export const handler = makeWorker("push");
