// DynamoDB Streams consumer (§3/§4.5) — event-driven availability push. When a StockLevel item
// changes (reservation, receiving, shipment), this fires within seconds and pushes the recomputed
// available-to-sell to all channels. Pushing on every StockLevel change is a superset of "crosses
// below buffer", so the dangerous downward crossing is never missed. The 5-min cron (P3) only
// reconciles drift — it is NOT the safety mechanism.
//
// The event source mapping filters to SK = STOCK#* (infra), so Order/Line/Reservation writes don't
// trigger this. We never write back to `core` here, so there's no feedback loop.

import type { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";
import { pushAvailabilityForSku } from "../stock/push.js";

function skuFromPk(pk: string | undefined): string | null {
  if (!pk || !pk.startsWith("SKU#")) return null;
  return pk.slice("SKU#".length);
}

export const handler = async (event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> => {
  // Collapse a batch to the distinct SKUs touched — multiple changes to one SKU push once.
  const skus = new Set<string>();
  for (const record of event.Records) {
    const sk = record.dynamodb?.Keys?.SK?.S;
    if (!sk || !sk.startsWith("STOCK#")) continue; // belt-and-braces vs the infra filter
    const sku = skuFromPk(record.dynamodb?.Keys?.PK?.S);
    if (sku) skus.add(sku);
  }

  for (const sku of skus) {
    try {
      await pushAvailabilityForSku(sku);
    } catch (err) {
      // Best-effort: a failed push is recovered by the next stock change or the drift cron (P3).
      // Don't fail the whole batch on one channel hiccup.
      console.error(
        JSON.stringify({
          consumer: "stream-stock",
          sku,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return { batchItemFailures: [] };
};
