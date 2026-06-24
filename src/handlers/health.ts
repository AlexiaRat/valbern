// GET /api/health — liveness check (§3/§9: keep the existing health endpoint). No enqueue.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const handler = async (): Promise<APIGatewayProxyStructuredResultV2> => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ status: "ok", service: "valbern", ts: new Date().toISOString() }),
});
