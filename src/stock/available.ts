// Available-to-sell computation (§4.1). `availableFrom` is the SINGLE source of truth for the rule
// `available = on_hand - reserved - buffer[channel]` (floored at 0); computeAvailable is the IO
// wrapper that loads the items. Raw on_hand is never returned — only available leaves this module.

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { doc, coreTable } from "../db/client.js";
import { DEFAULT_LOCATION, type Channel, type ProductItem, type StockLevelItem } from "../domain/types.js";
import { skuPk, stockSk, SK_META } from "../domain/keys.js";

export async function getProduct(sku: string): Promise<ProductItem | undefined> {
  const res = await doc.send(
    new GetCommand({ TableName: coreTable(), Key: { PK: skuPk(sku), SK: SK_META } }),
  );
  return res.Item as ProductItem | undefined;
}

export async function getStockLevel(
  sku: string,
  location: string = DEFAULT_LOCATION,
): Promise<StockLevelItem | undefined> {
  const res = await doc.send(
    new GetCommand({ TableName: coreTable(), Key: { PK: skuPk(sku), SK: stockSk(location) } }),
  );
  return res.Item as StockLevelItem | undefined;
}

/** The rule, pure. Buffer defaults to 0 when the product has none for that channel. */
export function availableFrom(
  product: Pick<ProductItem, "buffer"> | undefined,
  stock: Pick<StockLevelItem, "on_hand" | "reserved"> | undefined,
  channel: Channel,
): number {
  if (!stock) return 0;
  const buffer = product?.buffer?.[channel] ?? 0;
  return Math.max(0, stock.on_hand - stock.reserved - buffer);
}

export async function computeAvailable(
  sku: string,
  channel: Channel,
  location: string = DEFAULT_LOCATION,
): Promise<number> {
  const [product, stock] = await Promise.all([getProduct(sku), getStockLevel(sku, location)]);
  return availableFrom(product, stock, channel);
}
