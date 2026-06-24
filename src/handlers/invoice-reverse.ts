// POST /invoices/{orderId}/reverse — trigger a storno (§3). Internal ops endpoint, protected by
// API Gateway IAM (SigV4) auth at the gateway, so there's no body signature to verify here.
// Validates → idempotency → enqueue to the storno queue → fast. The storno worker (P3) does the work.
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { runEdge } from "../http/edge.js";

export const handler = (event: APIGatewayProxyEventV2) =>
  runEdge(event, {
    queueUrlEnv: "STORNO_QUEUE_URL",
    idempotencyKey: (e) => {
      const orderId = e.pathParameters?.orderId;
      return orderId ? `storno#${orderId}` : undefined;
    },
    buildMessage: (e) => ({ action: "reverse", orderId: e.pathParameters?.orderId }),
  });
