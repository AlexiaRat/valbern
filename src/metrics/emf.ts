// CloudWatch Embedded Metric Format (EMF). Writing a specially-shaped JSON log line makes
// CloudWatch auto-extract a metric — no PutMetricData call, no extra IAM (just logs). P2 attaches
// alarms (→ SNS → Slack) onto these metrics. Keep dimensions LOW-cardinality (Channel only); put
// high-cardinality context (sku, orderId) in `properties` so it's searchable but not a dimension.

interface EmfOptions {
  namespace: string;
  metricName: string;
  value: number;
  unit?: string;
  dimensions: Record<string, string>;
  properties?: Record<string, unknown>;
}

export function emitMetric(opts: EmfOptions): void {
  const line = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: opts.namespace,
          Dimensions: [Object.keys(opts.dimensions)],
          Metrics: [{ Name: opts.metricName, Unit: opts.unit ?? "Count" }],
        },
      ],
    },
    ...opts.dimensions,
    ...(opts.properties ?? {}),
    [opts.metricName]: opts.value,
  };
  console.log(JSON.stringify(line));
}

// Oversell caught at ingestion (§4.2 / §7) — the signal P2 alarms on.
export function emitOversold(channel: string, sku: string, orderId: string, qty: number): void {
  emitMetric({
    namespace: "Valbern/Oversell",
    metricName: "OversoldLines",
    value: 1,
    dimensions: { Channel: channel },
    properties: { sku, orderId, qty },
  });
}

// Availability at/under the channel buffer after a stock change (§4.5 low-stock danger).
export function emitLowStock(channel: string, sku: string, available: number): void {
  emitMetric({
    namespace: "Valbern/Stock",
    metricName: "LowStockAvailable",
    value: available,
    dimensions: { Channel: channel },
    properties: { sku },
  });
}

// --- §4.7 monitoring metrics ---

// Age of the last OK sync per channel — the dead-man's-switch signal (alarm when > threshold).
export function emitSyncAge(channel: string, ageSeconds: number): void {
  emitMetric({
    namespace: "Valbern/Monitoring",
    metricName: "SyncAgeSeconds",
    value: ageSeconds,
    unit: "Seconds",
    dimensions: { Channel: channel },
  });
}

// One external API call per channel (success or failure); error count drives the error-rate alarm.
export function emitApiCall(channel: string, op: string, ok: boolean): void {
  emitMetric({
    namespace: "Valbern/Monitoring",
    metricName: "ChannelApiCalls",
    value: 1,
    dimensions: { Channel: channel },
    properties: { op, ok },
  });
}

export function emitApiError(channel: string, op: string, error: unknown): void {
  emitMetric({
    namespace: "Valbern/Monitoring",
    metricName: "ChannelApiErrors",
    value: 1,
    dimensions: { Channel: channel },
    properties: { op, error: error instanceof Error ? error.message : String(error) },
  });
}
