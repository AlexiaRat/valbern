// Idempotency claim at the edge (§4.3). A conditional PutItem on the `idempotency` table:
// the FIRST request for a key wins; re-deliveries fail the condition and are treated as no-ops.
// Items self-expire via TTL so the table doesn't grow unbounded.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "../env.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Returns true if this key was freshly claimed, false if it was already seen (duplicate). */
export async function claimIdempotencyKey(key: string): Promise<boolean> {
  const table = requireEnv("IDEMPOTENCY_TABLE");
  try {
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          PK: key,
          ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
          claimedAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return false;
    }
    throw err;
  }
}
