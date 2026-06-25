// Domain entity types for the single `core` table (§5) + the lifecycle enums (§4).
// These are the persisted shapes; key construction lives in keys.ts.

export type Channel = "emag" | "trendyol" | "medusa";
export const CHANNELS: readonly Channel[] = ["emag", "trendyol", "medusa"] as const;

// Single default warehouse location for P1 (multi-location allocation is a later phase).
export const DEFAULT_LOCATION = "MAIN";

// ---- lifecycle state machines (§4) ----

export type StockUnitStatus =
  | "received"
  | "qc_pending"
  | "qc_ok"
  | "qc_failed"
  | "on_shelf"
  | "reserved"
  | "shipped";

export type OrderStatus =
  | "ingested"
  | "invoiced"
  | "awb_created"
  | "picking"
  | "packing"
  | "shipped"
  | "settled"
  | "cancelled"
  | "returned";

export type OrderLineStatus = "reserved" | "oversold" | "shipped" | "cancelled";

export type ReservationStatus = "held" | "released" | "consumed";

export type RmaStatus =
  | "requested"
  | "authorized"
  | "received"
  | "qc"
  | "restock"
  | "scrap"
  | "storno_issued"
  | "storno_confirmed";

// Invoice/SPV status — the only "done" is `accepted` (§3.6).
export type SpvStatus = "uploaded" | "accepted" | "rejected" | "blocked";

// ---- per-channel buffer (§3.1) ----

export type ChannelBuffer = Record<Channel, number>;

// ---- persisted entities ----

export interface ProductItem {
  PK: string; // SKU#<sku>
  SK: "META";
  sku: string;
  asin?: string;
  gtin?: string;
  ean?: string;
  serialized: boolean;
  buffer: ChannelBuffer;
  codaloc_ref?: string; // CODALOC/GS1 barcode→SKU mapping (§9)
  createdAt: string;
  updatedAt: string;
}

export interface StockLevelItem {
  PK: string; // SKU#<sku>
  SK: string; // STOCK#<location>
  sku: string;
  location: string;
  on_hand: number; // raw — NEVER leaves the system (§4.1)
  reserved: number;
  // Stored reservable counter, INVARIANT: available == on_hand - reserved. It exists because
  // DynamoDB ConditionExpressions can't do arithmetic, so the §7 gate compares `available >= qty`
  // directly. Every stock mutation maintains it atomically (see src/stock/reserve.ts).
  available: number;
  updatedAt: string;
}

export interface PhysicalUnitItem {
  PK: string; // SKU#<sku>
  SK: string; // UNIT#<serial>
  sku: string;
  serial: string;
  status: StockUnitStatus;
  location?: string;
  order_id?: string;
  awb?: string;
  updatedAt: string;
}

export interface ReservationItem {
  PK: string; // ORDER#<channel>#<id>
  SK: string; // RES#<sku>
  sku: string;
  qty: number;
  status: ReservationStatus;
  updatedAt: string;
}

export interface OrderItem {
  PK: string; // ORDER#<channel>#<id>
  SK: "META";
  channel: Channel;
  orderId: string;
  status: OrderStatus;
  maximum_date_for_shipment?: string; // ISO; eMAG SLA (§4, P4)
  late_flag?: boolean;
  // GSI1 — ship-deadline queue; set only while status ∈ {ingested, picking, packing}
  GSI1PK?: string; // SHIPQ#<channel>
  GSI1SK?: string; // <max_ship_date ISO>
  createdAt: string;
  updatedAt: string;
}

export interface OrderLineItem {
  PK: string; // ORDER#<channel>#<id>
  SK: string; // LINE#<n>
  lineNo: number;
  sku: string;
  qty: number;
  status: OrderLineStatus;
}

export interface InvoiceItem {
  PK: string; // ORDER#<channel>#<id>
  SK: string; // INVOICE#<smartbill_id>
  smartbillId: string;
  isStorno: boolean;
  spv_status: SpvStatus;
  spv_checked_at?: string;
  // GSI2 — invoices missing SPV; set only while spv_status != accepted
  GSI2PK?: string; // SPV#PENDING
  GSI2SK?: string; // <created_at>
  createdAt: string;
}

export interface ShipmentItem {
  PK: string; // ORDER#<channel>#<id>
  SK: string; // AWB#<id>
  courier?: string; // chosen by Innoship — never hardcoded (§8)
  awb: string;
  label_ref?: string;
  status: string;
  bulk_batch_id?: string; // set when created via createAwbBulk (§8)
  updatedAt: string;
}

export interface RmaItem {
  PK: string; // RMA#<id>
  SK: "META";
  rmaId: string;
  order_id: string;
  units: string[];
  storno_invoice_id?: string;
  status: RmaStatus;
  updatedAt: string;
}

export interface ChannelSyncStateItem {
  PK: string; // CHANNEL#<name>
  SK: "SYNC";
  channel: Channel;
  last_ok_sync?: string; // ISO; dead-man's switch input (§4.7, P2)
  last_error?: string;
  error_rate_5m?: number;
}

export interface NirLine {
  sku: string;
  qty: number;
  location?: string;
}

// GoodsReceipt / NIR — auto-generated on receiving a confirmed delivery (§9, built in P5-adjacent receiving flow).
export interface NirItem {
  PK: string; // NIR#<id>
  SK: "META";
  nirId: string;
  supplier: string;
  lines: NirLine[];
  created_at: string;
}
