// Runtime secret fetch (§12 secrets model). Reads SSM Parameter Store SecureString values
// (decrypted via the customer-managed KMS key the Lambda role is granted kms:Decrypt on) and
// caches them in module scope with a short TTL — so rotation propagates within minutes without
// hammering SSM on every invocation. Only the parameter NAME comes from env; the value never does.

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});

// Short enough that a rotated secret is picked up quickly, long enough to avoid per-invoke calls.
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: string;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

export async function getSecret(parameterName: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(parameterName);
  if (hit && hit.expiresAt > now) return hit.value;

  const res = await ssm.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`secret missing or empty: ${parameterName}`);

  cache.set(parameterName, { value, expiresAt: now + TTL_MS });
  return value;
}
