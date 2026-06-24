// Adapter registry — the single place handlers resolve an adapter from. Keeps the rest of the
// codebase free of `new EmagChannelAdapter()` sprinkled around (§3.8).

import type { Channel } from "../domain/types.js";
import type { ChannelAdapter, CourierAdapter, InvoiceAdapter } from "./types.js";
import { EmagChannelAdapter } from "./channel/emag.js";
import { TrendyolChannelAdapter } from "./channel/trendyol.js";
import { MedusaChannelAdapter } from "./channel/medusa.js";
import { SmartBillInvoiceAdapter } from "./invoice/smartbill.js";
import { InnoshipCourierAdapter } from "./courier/innoship.js";

const channelAdapters: Record<Channel, ChannelAdapter> = {
  emag: new EmagChannelAdapter(),
  trendyol: new TrendyolChannelAdapter(),
  medusa: new MedusaChannelAdapter(),
};

export const getChannelAdapter = (channel: Channel): ChannelAdapter => channelAdapters[channel];
export const allChannelAdapters = (): ChannelAdapter[] => Object.values(channelAdapters);

export const invoiceAdapter: InvoiceAdapter = new SmartBillInvoiceAdapter();
export const courierAdapter: CourierAdapter = new InnoshipCourierAdapter();

export * from "./types.js";
