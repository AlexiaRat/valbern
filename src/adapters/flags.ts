// Per-adapter feature flags (§7: "behind a feature flag"). Read from env so an adapter
// can be dark-launched / killed without a redeploy. Default OFF — a stub that isn't
// explicitly enabled throws, so nothing silently runs against a real partner in P0.

export type AdapterFlag =
  | "ADAPTER_EMAG"
  | "ADAPTER_TRENDYOL"
  | "ADAPTER_MEDUSA"
  | "ADAPTER_SMARTBILL"
  | "ADAPTER_INNOSHIP";

const truthy = new Set(["1", "true", "on", "yes"]);

export function isEnabled(flag: AdapterFlag): boolean {
  return truthy.has((process.env[flag] ?? "").trim().toLowerCase());
}

export function assertEnabled(flag: AdapterFlag): void {
  if (!isEnabled(flag)) {
    throw new Error(`adapter disabled: set ${flag}=true to enable`);
  }
}
