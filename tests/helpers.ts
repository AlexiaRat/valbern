// Test fixtures against DynamoDB Local: create/drop the throwaway `core` table and seed SKUs.
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Channel } from "../src/domain/types";

const cfg = {
  endpoint: process.env.DDB_ENDPOINT,
  region: process.env.AWS_REGION || "local",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
};

const raw = new DynamoDBClient(cfg);
const docc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
const TABLE = process.env.CORE_TABLE as string;

export async function createTable(): Promise<void> {
  await dropTable();
  await raw.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
    }),
  );
  await waitUntilTableExists({ client: raw, maxWaitTime: 60, minDelay: 1 }, { TableName: TABLE });
}

export async function dropTable(): Promise<void> {
  try {
    await raw.send(new DeleteTableCommand({ TableName: TABLE }));
  } catch {
    // table didn't exist — fine
  }
}

type Buffer = Partial<Record<Channel, number>>;

export async function seedSku(sku: string, onHand: number, buffer: Buffer = {}): Promise<void> {
  await docc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SKU#${sku}`,
        SK: "META",
        sku,
        serialized: false,
        buffer: { emag: 0, trendyol: 0, medusa: 0, ...buffer },
        createdAt: "seed",
        updatedAt: "seed",
      },
    }),
  );
  await docc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SKU#${sku}`,
        SK: "STOCK#MAIN",
        sku,
        location: "MAIN",
        on_hand: onHand,
        reserved: 0,
        available: onHand, // invariant: available == on_hand - reserved
        updatedAt: "seed",
      },
    }),
  );
}

export async function getStock(
  sku: string,
): Promise<{ on_hand: number; reserved: number } | undefined> {
  const r = await docc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `SKU#${sku}`, SK: "STOCK#MAIN" } }),
  );
  return r.Item as { on_hand: number; reserved: number } | undefined;
}
