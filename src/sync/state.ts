// Per-channel sync state (§4.7 dead-man's switch). Every successful sync writes `last_ok_sync`;
// the scheduled checker reads it and alarms when the age crosses the threshold — so a channel that
// goes SILENT (no errors, just nothing) is detected, not just one that throws.

import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { doc, coreTable } from "../db/client.js";
import { channelPk, SK_SYNC } from "../domain/keys.js";
import type { Channel, ChannelSyncStateItem } from "../domain/types.js";

export async function recordOkSync(channel: Channel): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: coreTable(),
      Key: { PK: channelPk(channel), SK: SK_SYNC },
      UpdateExpression: "SET #ch = :c, last_ok_sync = :now",
      ExpressionAttributeNames: { "#ch": "channel" },
      ExpressionAttributeValues: { ":c": channel, ":now": new Date().toISOString() },
    }),
  );
}

export async function getSyncState(channel: Channel): Promise<ChannelSyncStateItem | undefined> {
  const res = await doc.send(
    new GetCommand({ TableName: coreTable(), Key: { PK: channelPk(channel), SK: SK_SYNC } }),
  );
  return res.Item as ChannelSyncStateItem | undefined;
}

/** Seconds since the channel last synced OK. Never-synced ⇒ +Infinity (dead-man fires). Pure. */
export function syncAgeSeconds(
  state: Pick<ChannelSyncStateItem, "last_ok_sync"> | undefined,
  nowMs: number,
): number {
  if (!state?.last_ok_sync) return Number.POSITIVE_INFINITY;
  const last = Date.parse(state.last_ok_sync);
  if (Number.isNaN(last)) return Number.POSITIVE_INFINITY;
  return (nowMs - last) / 1000;
}
