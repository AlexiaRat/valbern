// Medusa (own storefront) adapter. P0 stub. Talks to our own Medusa backend rather than a
// third-party marketplace, so availability pushes go to Medusa's inventory module.

import type { ChannelAdapter, IncomingOrder } from "../types.js";
import { assertEnabled } from "../flags.js";

export class MedusaChannelAdapter implements ChannelAdapter {
  readonly channel = "medusa" as const;

  async fetchOrders(_since: Date): Promise<IncomingOrder[]> {
    assertEnabled("ADAPTER_MEDUSA");
    return [];
  }

  async pushAvailable(_sku: string, _qty: number): Promise<void> {
    assertEnabled("ADAPTER_MEDUSA");
    throw new Error("MedusaChannelAdapter.pushAvailable not implemented (P1)");
  }

  async ackOrder(_id: string): Promise<void> {
    assertEnabled("ADAPTER_MEDUSA");
    throw new Error("MedusaChannelAdapter.ackOrder not implemented (P1)");
  }

  async fetchShipDeadline(_order: IncomingOrder): Promise<Date | undefined> {
    assertEnabled("ADAPTER_MEDUSA");
    return undefined;
  }
}
