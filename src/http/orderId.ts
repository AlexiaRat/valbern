// Derives a stable idempotency id from a webhook body. Tries the common id fields each channel
// uses; if the body isn't JSON or has no recognisable id, falls back to a hash of the raw body so
// that re-delivery of the identical payload still dedupes (§4.3/§4.4).

import { createHash } from "node:crypto";

const ID_FIELDS = [
  "order_id",
  "orderId",
  "id",
  "orderNumber",
  "order_number",
  "shipmentPackageId",
];

export function extractOrderId(rawBody: string): string | undefined {
  if (!rawBody) return undefined;
  try {
    const obj = JSON.parse(rawBody) as Record<string, unknown>;
    for (const field of ID_FIELDS) {
      const v = obj[field];
      if (typeof v === "string" && v) return v;
      if (typeof v === "number") return String(v);
    }
  } catch {
    // not JSON — fall through to content hash
  }
  return createHash("sha256").update(rawBody).digest("hex").slice(0, 32);
}
