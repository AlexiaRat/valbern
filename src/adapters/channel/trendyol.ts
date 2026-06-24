// Trendyol Partner API adapter. P0 stub. NOTE (§7 Trendyol lesson): live calls must egress
// through the static NAT IP so the partner WAF allowlist holds — that's enforced in the
// Lambda's VPC/subnet config (infra), not in this file.

import type { ChannelAdapter, IncomingOrder } from "../types.js";
import { assertEnabled } from "../flags.js";

export class TrendyolChannelAdapter implements ChannelAdapter {
  readonly channel = "trendyol" as const;

  async fetchOrders(_since: Date): Promise<IncomingOrder[]> {
    assertEnabled("ADAPTER_TRENDYOL");
    return [];
  }

  async pushAvailable(_sku: string, _qty: number): Promise<void> {
    assertEnabled("ADAPTER_TRENDYOL");
    throw new Error("TrendyolChannelAdapter.pushAvailable not implemented (P1)");
  }

  async ackOrder(_id: string): Promise<void> {
    assertEnabled("ADAPTER_TRENDYOL");
    throw new Error("TrendyolChannelAdapter.ackOrder not implemented (P1)");
  }

  async fetchShipDeadline(_order: IncomingOrder): Promise<Date | undefined> {
    assertEnabled("ADAPTER_TRENDYOL");
    return undefined; // Trendyol has no eMAG-style hard SLA field; computed later if needed.
  }
}
