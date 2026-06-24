// Shared synchronous-edge runner (§3). Every webhook/ops handler does the same four things and
// nothing heavy: (1) optionally verify authenticity, (2) claim an idempotency key, (3) enqueue to
// SQS, (4) return fast. The actual work happens later in the worker Lambda off the queue.

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { claimIdempotencyKey } from "./idempotency.js";
import { enqueue } from "../sqs/enqueue.js";
import { requireEnv } from "../env.js";

export interface EdgeOptions {
  /** Env var name holding the destination queue URL. */
  queueUrlEnv: string;
  /** Dedupe key for this request (e.g. `emag#order#<id>`). Return undefined ⇒ 400. */
  idempotencyKey(event: APIGatewayProxyEventV2, rawBody: string): string | undefined;
  /** The message body to enqueue for the worker. */
  buildMessage(event: APIGatewayProxyEventV2, rawBody: string): unknown;
  /** Optional authenticity check — throws if the request is not authentic. */
  verify?(event: APIGatewayProxyEventV2, rawBody: string): Promise<void>;
}

function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function rawBodyOf(event: APIGatewayProxyEventV2): string {
  if (event.body === undefined) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

export async function runEdge(
  event: APIGatewayProxyEventV2,
  opts: EdgeOptions,
): Promise<APIGatewayProxyStructuredResultV2> {
  const rawBody = rawBodyOf(event);

  if (opts.verify) {
    try {
      await opts.verify(event, rawBody);
    } catch {
      return json(401, { error: "unauthorized" });
    }
  }

  const key = opts.idempotencyKey(event, rawBody);
  if (!key) return json(400, { error: "missing or invalid idempotency key" });

  const fresh = await claimIdempotencyKey(key);
  if (!fresh) return json(200, { status: "duplicate", key });

  await enqueue(requireEnv(opts.queueUrlEnv), {
    key,
    receivedAt: new Date().toISOString(),
    payload: opts.buildMessage(event, rawBody),
  });

  return json(202, { status: "accepted", key });
}
