// Normalizes an enqueued order message into the internal IngestionOrder shape the worker reserves
// against. Accepts either:
//   - an already-normalized order ({ channel, orderId, lines: [{sku, qty}] }), or
//   - the edge envelope { payload: { channel, raw } } where `raw` is the channel's JSON body.
// Channel-specific raw→normalized mapping (eMAG/Trendyol/Medusa field quirks) is filled in when the
// real adapters land; for now we read a generic { order_id, lines:[{sku, qty}] } shape.

import { CHANNELS, type Channel } from "../domain/types.js";

export interface IngestionLine {
  lineNo: number;
  sku: string;
  qty: number;
}

export interface IngestionOrder {
  channel: Channel;
  orderId: string;
  lines: IngestionLine[];
  maximumDateForShipment?: string;
}

function isChannel(v: unknown): v is Channel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
}

function toLines(raw: unknown): IngestionLine[] {
  if (!Array.isArray(raw)) throw new Error("order has no lines[]");
  return raw.map((l, i) => {
    const o = l as Record<string, unknown>;
    const sku = o.sku ?? o.product_id ?? o.productId;
    const qty = o.qty ?? o.quantity;
    if (typeof sku !== "string" || !sku) throw new Error(`line ${i}: missing sku`);
    if (typeof qty !== "number" || qty <= 0) throw new Error(`line ${i}: invalid qty`);
    const lineNo = typeof o.lineNo === "number" ? o.lineNo : i + 1;
    return { lineNo, sku, qty };
  });
}

function fromRaw(channel: unknown, obj: Record<string, unknown>): IngestionOrder {
  if (!isChannel(channel)) throw new Error(`unknown channel: ${String(channel)}`);
  const orderId = obj.orderId ?? obj.order_id ?? obj.id;
  if (typeof orderId !== "string" && typeof orderId !== "number") {
    throw new Error("order has no id");
  }
  const deadline = obj.maximumDateForShipment ?? obj.maximum_date_for_shipment;
  return {
    channel,
    orderId: String(orderId),
    lines: toLines(obj.lines),
    maximumDateForShipment: typeof deadline === "string" ? deadline : undefined,
  };
}

export function normalizeMessage(body: string): IngestionOrder {
  const env = JSON.parse(body) as Record<string, unknown>;
  const payload = (env.payload ?? env) as Record<string, unknown>;

  // Already normalized.
  if (Array.isArray(payload.lines) && payload.channel && payload.orderId) {
    return fromRaw(payload.channel, payload);
  }
  // Edge envelope { channel, raw }.
  if (typeof payload.raw === "string") {
    return fromRaw(payload.channel, JSON.parse(payload.raw) as Record<string, unknown>);
  }
  // Raw object carrying its own channel.
  return fromRaw(payload.channel, payload);
}
