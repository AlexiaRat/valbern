// Dead-man's-switch age computation (§4.7). Pure — no DynamoDB needed.
import { describe, it, expect } from "vitest";
import { syncAgeSeconds } from "../src/sync/state";

describe("syncAgeSeconds (§4.7 dead-man's switch)", () => {
  it("a recent sync → small age, below the 15-min threshold", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    expect(syncAgeSeconds({ last_ok_sync: "2026-01-01T00:09:00Z" }, now)).toBe(60);
  });

  it("an old sync → age over the threshold (alarm fires)", () => {
    const now = Date.parse("2026-01-01T01:00:00Z");
    expect(syncAgeSeconds({ last_ok_sync: "2026-01-01T00:00:00Z" }, now)).toBeGreaterThan(900);
  });

  it("never synced / no state → +Infinity (silence is detected)", () => {
    expect(syncAgeSeconds(undefined, Date.now())).toBe(Number.POSITIVE_INFINITY);
    expect(syncAgeSeconds({}, Date.now())).toBe(Number.POSITIVE_INFINITY);
  });

  it("garbage timestamp → +Infinity, never a falsely-fresh age", () => {
    expect(syncAgeSeconds({ last_ok_sync: "not-a-date" }, Date.now())).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
