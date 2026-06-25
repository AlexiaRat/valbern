// SQS worker — order ingestion (§3/§4.2). For each message: normalize → reserve every line (§7)
// → ack the channel (only AFTER reservation, and only if the adapter is enabled). Failures report
// per-message so only the failed ones retry → DLQ. No invoicing/AWB here (that's P3/P4).

import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { normalizeMessage } from "../ingestion/normalize.js";
import { ingestOrder } from "../ingestion/ingest.js";
import { getChannelAdapter } from "../adapters/index.js";
import { isEnabled, type AdapterFlag } from "../adapters/flags.js";
import type { Channel } from "../domain/types.js";

const FLAG_BY_CHANNEL: Record<Channel, AdapterFlag> = {
  emag: "ADAPTER_EMAG",
  trendyol: "ADAPTER_TRENDYOL",
  medusa: "ADAPTER_MEDUSA",
};

async function ackIfEnabled(channel: Channel, orderId: string): Promise<void> {
  if (!isEnabled(FLAG_BY_CHANNEL[channel])) return; // adapter dark → skip the external ack
  await getChannelAdapter(channel).ackOrder(orderId);
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const order = normalizeMessage(record.body);
      const result = await ingestOrder(order);
      await ackIfEnabled(order.channel, order.orderId);
      console.log(
        JSON.stringify({
          worker: "order",
          channel: order.channel,
          orderId: order.orderId,
          reserved: result.reserved,
          oversold: result.oversold.length,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          worker: "order",
          messageId: record.messageId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
