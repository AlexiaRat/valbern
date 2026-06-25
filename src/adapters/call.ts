// Wraps an external channel call so every attempt emits success/error metrics (§4.7 error-rate).
// All channel adapter calls should go through this so the per-channel error count is complete.
// (Retry/backoff per §12 will compose around this in a later pass.)

import type { Channel } from "../domain/types.js";
import { emitApiCall, emitApiError } from "../metrics/emf.js";

export async function withChannelCall<T>(
  channel: Channel,
  op: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    emitApiCall(channel, op, true);
    return result;
  } catch (err) {
    emitApiCall(channel, op, false);
    emitApiError(channel, op, err);
    throw err;
  }
}
