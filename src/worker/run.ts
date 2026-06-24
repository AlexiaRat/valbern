// Shared SQS worker skeleton (§3: SQS → worker Lambdas). P0 has no business logic — each worker
// logs its records and reports no batch failures. Returning `batchItemFailures: []` consumes the
// batch; P1+ fills in per-record processing and partial-batch retries (failed ids go back to the
// queue, then to the DLQ after maxReceiveCount — §12). Lives outside src/handlers so the build
// script doesn't treat it as its own Lambda entrypoint.

import type { SQSEvent, SQSBatchResponse } from "aws-lambda";

export function makeWorker(name: string) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    for (const record of event.Records) {
      console.log(
        JSON.stringify({ worker: name, messageId: record.messageId, body: record.body }),
      );
    }
    return { batchItemFailures: [] };
  };
}
