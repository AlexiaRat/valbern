// eMAG Marketplace adapter (API v4.5.1). P0 stub, built fresh — real calls land in P1+
// (orders/availability) and P4 (maximum_date_for_shipment / late_shipment). Orders arrive via
// the eMAG order-notification callback; AWB creation lives in the CourierAdapter (Innoship), not here.

import type { ChannelAdapter, IncomingOrder } from "../types.js";
import { assertEnabled } from "../flags.js";

export class EmagChannelAdapter implements ChannelAdapter {
  readonly channel = "emag" as const;

  async fetchOrders(_since: Date): Promise<IncomingOrder[]> {
    assertEnabled("ADAPTER_EMAG");
    // P0: no live integration yet. Poll handler treats [] as "nothing new".
    return [];
  }

  async pushAvailable(_sku: string, _qty: number): Promise<void> {
    assertEnabled("ADAPTER_EMAG");
    // Receives computeAvailable() output only — never raw on_hand (§3.1). Implemented in P1.
    throw new Error("EmagChannelAdapter.pushAvailable not implemented (P1)");
  }

  async ackOrder(_id: string): Promise<void> {
    assertEnabled("ADAPTER_EMAG");
    throw new Error("EmagChannelAdapter.ackOrder not implemented (P1)");
  }

  async fetchShipDeadline(order: IncomingOrder): Promise<Date | undefined> {
    assertEnabled("ADAPTER_EMAG");
    return order.maximumDateForShipment; // eMAG: maximum_date_for_shipment (P4)
  }
}
