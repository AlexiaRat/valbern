// POST /webhooks/medusa — own-storefront order (§3). Verify → idempotency → enqueue → fast.
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { runEdge } from "../http/edge.js";
import { verifyWebhook } from "../http/signature.js";
import { extractOrderId } from "../http/orderId.js";

export const handler = (event: APIGatewayProxyEventV2) =>
  runEdge(event, {
    queueUrlEnv: "ORDER_QUEUE_URL",
    verify: (e, raw) => verifyWebhook("medusa", e.headers, raw),
    idempotencyKey: (_e, raw) => {
      const id = extractOrderId(raw);
      return id ? `medusa#order#${id}` : undefined;
    },
    buildMessage: (_e, raw) => ({ channel: "medusa", raw }),
  });
