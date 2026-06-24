// Innoship courier adapter. P0 stub, built fresh (§9: prior system was mono-courier).
// Innoship picks the courier + does least-cost routing (§10) across FAN/Cargus/Sameday/DPD/GLS —
// we MUST NOT hardcode any of them. The chosen courier comes back on the AwbRef.
// Supports single AND bulk AWB (§8/§9).

import type { CourierAdapter, AwbRef, ShipmentInput, TrackingStatus } from "../types.js";
import { assertEnabled } from "../flags.js";

export class InnoshipCourierAdapter implements CourierAdapter {
  async createAwb(_shipment: ShipmentInput): Promise<AwbRef> {
    assertEnabled("ADAPTER_INNOSHIP");
    throw new Error("InnoshipCourierAdapter.createAwb not implemented (P4+)");
  }

  async createAwbBulk(_shipments: ShipmentInput[]): Promise<AwbRef[]> {
    assertEnabled("ADAPTER_INNOSHIP");
    throw new Error("InnoshipCourierAdapter.createAwbBulk not implemented (P4+)");
  }

  async getLabel(_awbRef: AwbRef): Promise<Buffer> {
    assertEnabled("ADAPTER_INNOSHIP");
    throw new Error("InnoshipCourierAdapter.getLabel not implemented (P4+)");
  }

  async track(_awbRef: AwbRef): Promise<TrackingStatus> {
    assertEnabled("ADAPTER_INNOSHIP");
    throw new Error("InnoshipCourierAdapter.track not implemented (P4+)");
  }
}
