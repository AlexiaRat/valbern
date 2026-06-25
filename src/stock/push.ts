// The ONLY place availability is pushed to channels (§4.1). Everything here goes through
// availableFrom() — raw on_hand is never passed to an adapter. Each channel push is behind its
// feature flag: disabled ⇒ we compute + log the intended availability but make no external call,
// so P1 is safe to deploy with flags off. Low-stock (available <= buffer) emits an EMF metric.

import { CHANNELS, type Channel } from "../domain/types.js";
import { getProduct, getStockLevel, availableFrom } from "./available.js";
import { getChannelAdapter } from "../adapters/index.js";
import { isEnabled, type AdapterFlag } from "../adapters/flags.js";
import { emitLowStock } from "../metrics/emf.js";

const FLAG_BY_CHANNEL: Record<Channel, AdapterFlag> = {
  emag: "ADAPTER_EMAG",
  trendyol: "ADAPTER_TRENDYOL",
  medusa: "ADAPTER_MEDUSA",
};

export async function pushAvailabilityForSku(sku: string): Promise<void> {
  const [product, stock] = await Promise.all([getProduct(sku), getStockLevel(sku)]);
  if (!stock) {
    console.log(JSON.stringify({ msg: "push skipped: no stock row", sku }));
    return;
  }

  for (const channel of CHANNELS) {
    const available = availableFrom(product, stock, channel);
    const buffer = product?.buffer?.[channel] ?? 0;
    if (available <= buffer) emitLowStock(channel, sku, available);
    await pushOne(channel, sku, available);
  }
}

async function pushOne(channel: Channel, sku: string, available: number): Promise<void> {
  // INVARIANT: `available` is availableFrom() output (on_hand - reserved - buffer), never on_hand.
  if (!isEnabled(FLAG_BY_CHANNEL[channel])) {
    console.log(JSON.stringify({ msg: "push skipped: adapter disabled", channel, sku, available }));
    return;
  }
  await getChannelAdapter(channel).pushAvailable(sku, available);
}
