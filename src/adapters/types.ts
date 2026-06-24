// The three adapter interfaces (§8). Every external system sits behind one of these,
// so business logic never imports a vendor SDK directly (§4.8). All adapters are built
// fresh (greenfield, §2) — there is no legacy code to integrate.

import type { Channel, SpvStatus } from "../domain/types.js";

// ---- shared value objects ----

export interface OrderLineInput {
  lineNo: number;
  sku: string;
  qty: number;
}

export interface IncomingOrder {
  channel: Channel;
  orderId: string;
  lines: OrderLineInput[];
  maximumDateForShipment?: Date; // eMAG: maximum_date_for_shipment
  raw: unknown; // untouched vendor payload, for audit/replay
}

export interface InvoiceRef {
  smartbillId: string;
  series?: string;
  number?: string;
}

export interface AwbRef {
  awbId: string;
  courier: string; // chosen by Innoship — never hardcoded by us (§7)
  labelRef?: string;
}

export interface ShipmentInput {
  channel: Channel;
  orderId: string;
  // address/parcel details filled in once P3/P4 land; kept open for the stub.
  payload: unknown;
}

export interface TrackingStatus {
  awbId: string;
  status: string;
  updatedAt: Date;
}

// ---- §7 interfaces ----

export interface ChannelAdapter {
  readonly channel: Channel;
  /** Pull orders changed since `since`. Webhook path and poll path both land here (§4). */
  fetchOrders(since: Date): Promise<IncomingOrder[]>;
  /** Push available-to-sell only — computeAvailable(), NEVER raw on_hand (§3.1). */
  pushAvailable(sku: string, qty: number): Promise<void>;
  /** Ack the channel order — only after stock is reserved (§3.2). */
  ackOrder(id: string): Promise<void>;
  /** eMAG: maximum_date_for_shipment; others may return a computed/default deadline. */
  fetchShipDeadline(order: IncomingOrder): Promise<Date | undefined>;
}

export interface InvoiceAdapter {
  createInvoice(order: IncomingOrder): Promise<InvoiceRef>;
  reverseInvoice(invoiceRef: InvoiceRef): Promise<InvoiceRef>; // storno
  /** Poll SPV — "done" only when `accepted` (§3.6). Applies to forward + storno. */
  getSpvStatus(invoiceRef: InvoiceRef): Promise<SpvStatus>;
}

export interface CourierAdapter {
  createAwb(shipment: ShipmentInput): Promise<AwbRef>; // single
  createAwbBulk(shipments: ShipmentInput[]): Promise<AwbRef[]>; // bulk (eMAG did both — §9)
  getLabel(awbRef: AwbRef): Promise<Buffer>;
  track(awbRef: AwbRef): Promise<TrackingStatus>;
}
