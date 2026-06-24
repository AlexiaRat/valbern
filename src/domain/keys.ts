// Single-table key builders for `core` (§5). Centralised so key format lives in ONE place.
// Every PK/SK/GSI string the app writes or queries goes through these helpers.

import type { Channel } from "./types.js";

export const SK_META = "META" as const;
export const SK_SYNC = "SYNC" as const;

// ---- partition keys ----

export const skuPk = (sku: string) => `SKU#${sku}` as const;
export const orderPk = (channel: Channel, id: string) => `ORDER#${channel}#${id}` as const;
export const rmaPk = (id: string) => `RMA#${id}` as const;
export const channelPk = (channel: Channel) => `CHANNEL#${channel}` as const;
export const nirPk = (id: string) => `NIR#${id}` as const;

// ---- sort keys ----

export const stockSk = (location: string) => `STOCK#${location}` as const;
export const unitSk = (serial: string) => `UNIT#${serial}` as const;
export const reservationSk = (sku: string) => `RES#${sku}` as const;
export const orderLineSk = (lineNo: number) => `LINE#${lineNo}` as const;
export const invoiceSk = (smartbillId: string) => `INVOICE#${smartbillId}` as const;
export const awbSk = (awbId: string) => `AWB#${awbId}` as const;

// ---- GSI1: ship-deadline picking queue (sparse) ----
// Set only while order status ∈ {ingested, picking, packing}; clear it once shipped/cancelled.

export const shipQueuePk = (channel: Channel) => `SHIPQ#${channel}` as const;
export const shipQueueSk = (maxShipDateIso: string) => maxShipDateIso;

// ---- GSI2: invoices missing SPV acceptance (sparse) ----
// Set only while spv_status != accepted; clear it the moment SPV returns `accepted`.

export const SPV_PENDING_PK = "SPV#PENDING" as const;
export const spvPendingSk = (createdAtIso: string) => createdAtIso;
