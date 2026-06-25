// The reservation primitive (§7) — the heart of the system. Correctness comes from the conditional
// write, never from periodic sync.
//
// reserveLine is ONE atomic TransactWriteItems with two conditioned actions:
//   1. StockLevel: reserved += qty AND available -= qty, guarded by available >= qty → no oversell.
//   2. Reservation record: Put with attribute_not_exists(SK)                          → re-delivery no-op.
// Atomicity means a parallel pair racing the last unit can have AT MOST one succeed (§12 canary):
// the loser's `available >= qty` condition fails and we report `oversold` instead of shipping blind.
//
// Why a stored `available` instead of the spec's `(on_hand - reserved) >= qty`: DynamoDB
// ConditionExpressions don't support arithmetic, only comparisons. So we keep `available` as a
// stored counter (INVARIANT: available == on_hand - reserved) and gate on it. Every mutation below
// maintains the invariant atomically; nothing else may write on_hand/reserved/available.

import { TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { doc, coreTable } from "../db/client.js";
import { DEFAULT_LOCATION, type Channel } from "../domain/types.js";
import { skuPk, stockSk, orderPk, reservationSk } from "../domain/keys.js";

export type ReserveResult = "reserved" | "oversold" | "duplicate";

interface CancellationReason {
  Code?: string;
}

export async function reserveLine(
  channel: Channel,
  orderId: string,
  sku: string,
  qty: number,
  location: string = DEFAULT_LOCATION,
): Promise<ReserveResult> {
  const now = new Date().toISOString();
  try {
    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: coreTable(),
              Key: { PK: skuPk(sku), SK: stockSk(location) },
              UpdateExpression: "SET #r = #r + :q, #a = #a - :q, #u = :now",
              // attribute_exists guards against a SKU that has no stock row at all (⇒ oversold).
              ConditionExpression: "attribute_exists(PK) AND #a >= :q",
              ExpressionAttributeNames: { "#r": "reserved", "#a": "available", "#u": "updatedAt" },
              ExpressionAttributeValues: { ":q": qty, ":now": now },
            },
          },
          {
            Put: {
              TableName: coreTable(),
              Item: {
                PK: orderPk(channel, orderId),
                SK: reservationSk(sku),
                sku,
                qty,
                status: "held",
                updatedAt: now,
              },
              ConditionExpression: "attribute_not_exists(SK)",
            },
          },
        ],
      }),
    );
    return "reserved";
  } catch (err) {
    const reasons = (err as { CancellationReasons?: CancellationReason[] }).CancellationReasons;
    if (reasons) {
      const stockFailed = reasons[0]?.Code === "ConditionalCheckFailed";
      const reservationExists = reasons[1]?.Code === "ConditionalCheckFailed";
      // Reservation already recorded ⇒ this line was processed before ⇒ idempotent no-op.
      if (reservationExists) return "duplicate";
      if (stockFailed) return "oversold";
    }
    throw err;
  }
}

// Release on ship (§7): the unit physically leaves — drop BOTH on_hand and reserved. `available`
// is unchanged (it was already excluded by the reservation), preserving available == on_hand - reserved.
export async function releaseOnShip(
  sku: string,
  qty: number,
  location: string = DEFAULT_LOCATION,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: coreTable(),
      Key: { PK: skuPk(sku), SK: stockSk(location) },
      UpdateExpression: "SET #oh = #oh - :q, #r = #r - :q, #u = :now",
      ConditionExpression: "#oh >= :q AND #r >= :q",
      ExpressionAttributeNames: { "#oh": "on_hand", "#r": "reserved", "#u": "updatedAt" },
      ExpressionAttributeValues: { ":q": qty, ":now": new Date().toISOString() },
    }),
  );
}

// Release on cancel (§7): the order is dropped but the unit stays on the shelf — free reserved and
// return it to available.
export async function releaseOnCancel(
  sku: string,
  qty: number,
  location: string = DEFAULT_LOCATION,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: coreTable(),
      Key: { PK: skuPk(sku), SK: stockSk(location) },
      UpdateExpression: "SET #r = #r - :q, #a = #a + :q, #u = :now",
      ConditionExpression: "#r >= :q",
      ExpressionAttributeNames: { "#r": "reserved", "#a": "available", "#u": "updatedAt" },
      ExpressionAttributeValues: { ":q": qty, ":now": new Date().toISOString() },
    }),
  );
}
