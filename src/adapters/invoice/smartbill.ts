// SmartBill invoice adapter. P0 stub, built fresh. SmartBill creates + attaches the invoice AND
// transmits it to ANAF/SPV — the app does NOT build or transmit the XML (§9/§10). Our job is to
// trigger createInvoice reliably on `shipped` and then POLL getSpvStatus until `accepted` (§4.6).

import type { InvoiceAdapter, InvoiceRef, IncomingOrder } from "../types.js";
import type { SpvStatus } from "../../domain/types.js";
import { assertEnabled } from "../flags.js";

export class SmartBillInvoiceAdapter implements InvoiceAdapter {
  async createInvoice(_order: IncomingOrder): Promise<InvoiceRef> {
    assertEnabled("ADAPTER_SMARTBILL");
    throw new Error("SmartBillInvoiceAdapter.createInvoice not implemented (P3)");
  }

  async reverseInvoice(_invoiceRef: InvoiceRef): Promise<InvoiceRef> {
    assertEnabled("ADAPTER_SMARTBILL");
    throw new Error("SmartBillInvoiceAdapter.reverseInvoice (storno) not implemented (P3)");
  }

  async getSpvStatus(_invoiceRef: InvoiceRef): Promise<SpvStatus> {
    assertEnabled("ADAPTER_SMARTBILL");
    throw new Error("SmartBillInvoiceAdapter.getSpvStatus not implemented (P3)");
  }
}
