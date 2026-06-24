// SQS worker — order ingestion (§3). P0 skeleton; reservation primitive lands in P1.
import { makeWorker } from "../worker/run.js";
export const handler = makeWorker("order");
