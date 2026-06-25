// Shared scheduled-poll runner (§4: polling backfills anything a webhook missed).
// P0: skeleton only — it resolves the adapter, calls fetchOrders, and logs the count.
// It does NOT yet ingest/reserve (that's P1). Lives outside src/handlers so the build
// script doesn't treat it as its own Lambda entrypoint.

import type { Channel } from "../domain/types.js";
import { getChannelAdapter } from "../adapters/index.js";
import { isEnabled, type AdapterFlag } from "../adapters/flags.js";
import { withChannelCall } from "../adapters/call.js";
import { recordOkSync } from "../sync/state.js";

const FLAG_BY_CHANNEL: Record<Channel, AdapterFlag> = {
  emag: "ADAPTER_EMAG",
  trendyol: "ADAPTER_TRENDYOL",
  medusa: "ADAPTER_MEDUSA",
};

// How far back each poll looks. Overlap with the schedule interval is intentional —
// at-least-once + idempotent ingestion (§3.3) makes re-seeing an order a no-op.
const LOOKBACK_MS = 15 * 60 * 1000;

export async function runPoll(channel: Channel): Promise<{ channel: Channel; fetched: number }> {
  if (!isEnabled(FLAG_BY_CHANNEL[channel])) {
    console.log(JSON.stringify({ msg: "poll skipped: adapter disabled", channel }));
    return { channel, fetched: 0 };
  }

  const since = new Date(Date.now() - LOOKBACK_MS);
  const orders = await withChannelCall(channel, "fetchOrders", () =>
    getChannelAdapter(channel).fetchOrders(since),
  );

  // A completed poll is a successful sync — stamp the dead-man's-switch clock (§4.7).
  await recordOkSync(channel);

  // P1+ enqueues each fetched order to the `order` SQS queue for the ingestion worker.
  console.log(JSON.stringify({ msg: "poll complete", channel, fetched: orders.length, since }));
  return { channel, fetched: orders.length };
}
