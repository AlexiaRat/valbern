// Scheduled dead-man's-switch checker (§4.7). Runs every few minutes; for each channel it reads
// ChannelSyncState and emits SyncAgeSeconds. Because the checker ITSELF emits the metric (computed
// from stored last_ok_sync), a silent channel still produces a breaching data point — that's what
// makes the alarm fire on silence rather than only on errors. Never-synced ⇒ a large sentinel age.

import { CHANNELS } from "../domain/types.js";
import { getSyncState, syncAgeSeconds } from "../sync/state.js";
import { emitSyncAge } from "../metrics/emf.js";

const NEVER_SYNCED_AGE = 31_536_000; // 1 year — guaranteed to breach any sane threshold

export const handler = async (): Promise<void> => {
  const now = Date.now();
  for (const channel of CHANNELS) {
    const state = await getSyncState(channel);
    const age = syncAgeSeconds(state, now);
    emitSyncAge(channel, Number.isFinite(age) ? Math.round(age) : NEVER_SYNCED_AGE);
  }
};
