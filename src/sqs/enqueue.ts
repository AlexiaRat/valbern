// Thin SQS send helper. Standard (non-FIFO) queues — message-level dedupe is OUR job via the
// idempotency table (§4.3), not SQS's. Body is JSON.

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});

export async function enqueue(queueUrl: string, body: unknown): Promise<void> {
  await sqs.send(
    new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(body) }),
  );
}
