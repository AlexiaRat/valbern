// Shared DynamoDB document client. Honors DDB_ENDPOINT so tests can point at DynamoDB Local
// without touching real AWS; in Lambda the var is unset and the SDK resolves the real endpoint +
// role credentials. `removeUndefinedValues` lets us pass optional attributes as undefined.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "../env.js";

const endpoint = process.env.DDB_ENDPOINT;

const base = new DynamoDBClient(
  endpoint
    ? {
        endpoint,
        region: process.env.AWS_REGION || "local",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : {},
);

export const doc = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true },
});

export const coreTable = (): string => requireEnv("CORE_TABLE");
