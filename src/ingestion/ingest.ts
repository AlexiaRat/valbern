// Order ingestion (§4.2): persist the order, then reserve every line via the §7 primitive BEFORE
// the channel is acked. A line that can't be reserved is marked `oversold` (not shipped) and raises
// the oversell signal — we caught it instead of shipping blind. Idempotent: reserveLine dedupes a
// re-delivered line, and order/line Puts are overwrites of identical data.

import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { doc, coreTable } from "../db/client.js";
import { reserveLine } from "../stock/reserve.js";
import { emitOversold } from "../metrics/emf.js";
import type { IngestionOrder, IngestionLine } from "./normalize.js";
import { orderPk, orderLineSk, shipQueuePk, shipQueueSk, SK_META } from "../domain/keys.js";

export interface IngestResult {
  orderId: string;
  channel: string;
  reserved: number;
  oversold: IngestionLine[];
}

async function putOrder(order: IngestionOrder, now: string): Promise<void> {
  const deadline = order.maximumDateForShipment;
  await doc.send(
    new PutCommand({
      TableName: coreTable(),
      Item: {
        PK: orderPk(order.channel, order.orderId),
        SK: SK_META,
        channel: order.channel,
        orderId: order.orderId,
        status: "ingested",
        maximum_date_for_shipment: deadline,
        // GSI1 (ship-deadline queue) is populated while unshipped; the P4 consumer reads it.
        GSI1PK: deadline ? shipQueuePk(order.channel) : undefined,
        GSI1SK: deadline ? shipQueueSk(deadline) : undefined,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
}

async function putLine(
  order: IngestionOrder,
  line: IngestionLine,
  status: "reserved" | "oversold",
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: coreTable(),
      Item: {
        PK: orderPk(order.channel, order.orderId),
        SK: orderLineSk(line.lineNo),
        lineNo: line.lineNo,
        sku: line.sku,
        qty: line.qty,
        status,
      },
    }),
  );
}

export async function ingestOrder(order: IngestionOrder): Promise<IngestResult> {
  const now = new Date().toISOString();
  await putOrder(order, now);

  const oversold: IngestionLine[] = [];
  let reserved = 0;

  for (const line of order.lines) {
    const result = await reserveLine(order.channel, order.orderId, line.sku, line.qty);
    if (result === "oversold") {
      oversold.push(line);
      await putLine(order, line, "oversold");
      emitOversold(order.channel, line.sku, order.orderId, line.qty);
    } else {
      // reserved | duplicate (already held from a prior delivery) — both mean stock is secured.
      reserved += 1;
      await putLine(order, line, "reserved");
    }
  }

  return { orderId: order.orderId, channel: order.channel, reserved, oversold };
}
