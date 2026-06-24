// SQS worker — AWB creation via Innoship (§3). P0 skeleton; single + bulk AWB land in P4.
import { makeWorker } from "../worker/run.js";
export const handler = makeWorker("awb");
