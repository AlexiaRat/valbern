// POST /webhooks/emag — eMAG order-notification callback (§3). Verifies authenticity, claims an
// idempotency key, enqueues to the order queue, returns fast. No order processing here (that's the
// order worker, P1).
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { runEdge } from "../http/edge.js";
import { verifyWebhook } from "../http/signature.js";
import { extractOrderId } from "../http/orderId.js";

export const handler = (event: APIGatewayProxyEventV2) =>
  runEdge(event, {
    queueUrlEnv: "ORDER_QUEUE_URL",
    verify: (e, raw) => verifyWebhook("emag", e.headers, raw),
    idempotencyKey: (_e, raw) => {
      const id = extractOrderId(raw);
      return id ? `emag#order#${id}` : undefined;
    },
    buildMessage: (_e, raw) => ({ channel: "emag", raw }),
  });
