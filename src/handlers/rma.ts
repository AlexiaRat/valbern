// POST /rma/{action} — RMA authorize / receive / disposition (§3, internal ops, IAM-auth at the
// gateway). Validates → idempotency → enqueue → fast. The RMA state machine + auto-storno are P3.
//
// P0 routing note: the five fixed queues are order/invoice/awb/storno/push. The only async
// integration action the RMA flow ultimately drives is reverseInvoice (storno), so RMA messages
// land on the storno queue with an `rma`/action discriminator. P3 can split this out if needed.
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { runEdge } from "../http/edge.js";
import { extractOrderId } from "../http/orderId.js";

export const handler = (event: APIGatewayProxyEventV2) =>
  runEdge(event, {
    queueUrlEnv: "STORNO_QUEUE_URL",
    idempotencyKey: (e, raw) => {
      const action = e.pathParameters?.action;
      const id = extractOrderId(raw);
      return action && id ? `rma#${action}#${id}` : undefined;
    },
    buildMessage: (e, raw) => ({
      kind: "rma",
      action: e.pathParameters?.action,
      raw,
    }),
  });
