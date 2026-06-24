// SQS worker — invoice creation via SmartBill (§3). P0 skeleton; createInvoice on `shipped` lands in P3.
import { makeWorker } from "../worker/run.js";
export const handler = makeWorker("invoice");
