// Webhook authenticity verification (implemented in P0 per decision). Each channel signs its
// callbacks differently; we read that channel's signing secret from SSM (KMS-encrypted, §12) and
// verify against the RAW request body. Comparison is constant-time to avoid timing oracles.
//
// Header formats here are the greenfield baseline; refine exact header names/encodings against
// each partner's live docs in P1 when wiring real order ingestion.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Channel } from "../domain/types.js";
import { getSecret } from "../secrets/get.js";
import { requireEnv } from "../env.js";

type Scheme = "hmac-sha256-hex" | "hmac-sha256-base64" | "shared-secret";

interface ChannelVerifyConfig {
  header: string; // lowercase header carrying the signature/secret
  scheme: Scheme;
  /** Env var holding the SSM parameter name for this channel's webhook secret. */
  secretEnv: string;
}

const CONFIG: Record<Channel, ChannelVerifyConfig> = {
  // eMAG order-notification callback is protected by a shared credential on the Authorization header.
  emag: { header: "authorization", scheme: "shared-secret", secretEnv: "WEBHOOK_SECRET_EMAG" },
  // Trendyol-style HMAC signature (base64).
  trendyol: {
    header: "x-trendyol-signature",
    scheme: "hmac-sha256-base64",
    secretEnv: "WEBHOOK_SECRET_TRENDYOL",
  },
  // Medusa webhook HMAC (hex).
  medusa: {
    header: "x-medusa-signature",
    scheme: "hmac-sha256-hex",
    secretEnv: "WEBHOOK_SECRET_MEDUSA",
  },
};

function headerValue(headers: Record<string, string | undefined>, name: string): string {
  // API Gateway HTTP API lowercases header keys, but normalise defensively.
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name && v !== undefined) return v;
  }
  return "";
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export class WebhookAuthError extends Error {}

/** Throws WebhookAuthError if the request is not authentic. */
export async function verifyWebhook(
  channel: Channel,
  headers: Record<string, string | undefined>,
  rawBody: string,
): Promise<void> {
  const cfg = CONFIG[channel];
  const secret = await getSecret(requireEnv(cfg.secretEnv));
  const presented = headerValue(headers, cfg.header);
  if (!presented) throw new WebhookAuthError(`missing ${cfg.header} header`);

  if (cfg.scheme === "shared-secret") {
    if (!constantTimeEqual(presented, secret)) throw new WebhookAuthError("bad credential");
    return;
  }

  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest(cfg.scheme === "hmac-sha256-hex" ? "hex" : "base64");
  if (!constantTimeEqual(presented, digest)) throw new WebhookAuthError("bad signature");
}
