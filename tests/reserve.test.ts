// The mandatory §12 canary plus the supporting reservation/availability invariants.
// Runs against DynamoDB Local (npm run db:up) so the conditional-write semantics are REAL.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { reserveLine, releaseOnShip, releaseOnCancel } from "../src/stock/reserve";
import { computeAvailable } from "../src/stock/available";
import { createTable, dropTable, seedSku, getStock } from "./helpers";

beforeAll(createTable);
afterAll(dropTable);

describe("reservation primitive (§7)", () => {
  it("two parallel reservations on the LAST unit → exactly one wins (the §12 canary)", async () => {
    const sku = "RACE-1";
    await seedSku(sku, 1);

    const results = await Promise.all([
      reserveLine("emag", "ORDER-A", sku, 1),
      reserveLine("emag", "ORDER-B", sku, 1),
    ]);

    expect(results.filter((r) => r === "reserved")).toHaveLength(1);
    expect(results.filter((r) => r === "oversold")).toHaveLength(1);

    const stock = await getStock(sku);
    expect(stock?.reserved).toBe(1);
    expect(stock?.on_hand).toBe(1); // on_hand untouched until ship
  });

  it("oversell is caught, not shipped: reserving more than available returns oversold", async () => {
    const sku = "OVER-1";
    await seedSku(sku, 2);
    expect(await reserveLine("emag", "O1", sku, 2)).toBe("reserved");
    expect(await reserveLine("emag", "O2", sku, 1)).toBe("oversold");
    const stock = await getStock(sku);
    expect(stock?.reserved).toBe(2);
  });

  it("a SKU with no stock row is oversold, never a phantom reservation", async () => {
    expect(await reserveLine("emag", "O1", "GHOST", 1)).toBe("oversold");
  });

  it("re-delivering the same order line is an idempotent no-op (duplicate)", async () => {
    const sku = "DUP-1";
    await seedSku(sku, 5);
    expect(await reserveLine("medusa", "ORD", sku, 2)).toBe("reserved");
    expect(await reserveLine("medusa", "ORD", sku, 2)).toBe("duplicate");
    const stock = await getStock(sku);
    expect(stock?.reserved).toBe(2); // not 4 — the duplicate did not double-reserve
  });
});

describe("computeAvailable (§4.1)", () => {
  it("available = on_hand - reserved - buffer[channel], floored at 0", async () => {
    const sku = "AVL-1";
    await seedSku(sku, 10, { emag: 3 });
    await reserveLine("emag", "O1", sku, 2);
    // 10 - 2 - 3 = 5 for emag; trendyol has buffer 0 → 10 - 2 - 0 = 8
    expect(await computeAvailable(sku, "emag")).toBe(5);
    expect(await computeAvailable(sku, "trendyol")).toBe(8);
  });

  it("never goes negative", async () => {
    const sku = "AVL-2";
    await seedSku(sku, 1, { emag: 5 });
    expect(await computeAvailable(sku, "emag")).toBe(0);
  });
});

describe("reservation release (§7)", () => {
  it("ship drops both on_hand and reserved", async () => {
    const sku = "SHIP-1";
    await seedSku(sku, 3);
    await reserveLine("emag", "O1", sku, 2);
    await releaseOnShip(sku, 2);
    const stock = await getStock(sku);
    expect(stock?.on_hand).toBe(1);
    expect(stock?.reserved).toBe(0);
  });

  it("cancel frees reserved only — on_hand stays on the shelf", async () => {
    const sku = "CANCEL-1";
    await seedSku(sku, 3);
    await reserveLine("emag", "O1", sku, 2);
    await releaseOnCancel(sku, 2);
    const stock = await getStock(sku);
    expect(stock?.on_hand).toBe(3);
    expect(stock?.reserved).toBe(0);
  });
});
