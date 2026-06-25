# WMS + Multichannel E-Commerce Orchestrator — Build Specification (Greenfield)

> **How to use this file.** This is the persistent context for a **from-scratch** build. It lives as `CLAUDE.md` at the repo root so the agent reads it every session. **Assume nothing exists** — no prior code, no copy-paste. Build **one phase at a time** (§11). §4 (principles), §6–§7 (data model + reservation) are non-negotiable.
>
> **Provenance of the requirements.** §9 ("Known behavior to replicate") documents how the previous system worked, as target behavior to **rebuild fresh** — it is NOT a reference to existing code. The data model (§6) and runtime topology (§3) are the recommended greenfield design.

---

## 1. Mission

One system owning the warehouse-to-marketplace pipeline: **receiving → QC → putaway → multichannel stock → order ingestion → invoicing → AWB → pick/pack/ship → returns → reconciliation**.

Channels: **eMAG Marketplace** (API v4.5.1), **Trendyol** (Partner API), **Medusa** (own storefront).

The system **orchestrates**. It does NOT reimplement e-invoicing transport, SAF-T, or courier label generation — those are rented (§10).

---

## 2. Tech stack & constraints

- **Greenfield.** Build every component fresh. There is no legacy code to integrate.
- **Runtime:** TypeScript on Node 20, AWS Lambda. *(Assumption — change if you prefer; TS keeps one language with Medusa.)*
- **Data:** DynamoDB. Single-table for related entities; a dedicated counter item for stock. **PITR ON per table** (per-table, not account-wide).
- **Async:** SQS — one queue per integration action (order, invoice, awb, storno, push), **each with a DLQ**. EventBridge Scheduler for cron/poll jobs.
- **Events:** DynamoDB Streams → Lambda for critical low-stock channel push.
- **Observability:** CloudWatch alarms + Synthetics canaries, **SNS → Slack**.
- **IaC:** Terraform. Fully reproducible. Only click-ops allowed: the break-glass IAM account (§12).
- **Secrets:** SSM Parameter Store / Secrets Manager. No secrets in code.

---

## 3. Runtime & API topology

Canonical serverless shape — synchronous edge that validates + enqueues, async workers that do the work:

- **API Gateway (HTTP API) → Lambda** for all synchronous endpoints. Handlers validate, write an idempotency key, enqueue to SQS, and return fast. They never do heavy work inline.
- **SQS → worker Lambdas** for processing (order, invoice, awb, storno, push). Each worker idempotent, each queue with a DLQ.
- **EventBridge Scheduler** for poll/cron: order backfill, SPV status poll, sync-age check, SLA deadline check, daily reconciliation.
- **DynamoDB Streams → Lambda** for immediate low-stock availability push.

**Route surface to build (fresh):**
- `POST /webhooks/emag` — eMAG order notification → enqueue (callback model; when callback is set, eMAG stops emailing).
- `POST /webhooks/trendyol` — Trendyol order notification → enqueue.
- `POST /webhooks/medusa` — storefront order → enqueue.
- `POST /invoices/{orderId}/reverse` — trigger storno (the prior system exposed this as `/smartbill/invoice/reverse`).
- `POST /rma/...` — RMA authorize / receive / disposition (internal ops).
- `GET  /api/health` — health check (keep this; it already existed).

---

## 4. Architectural principles (non-negotiable)

1. **Available-to-sell, never on-hand.** Push `available = on_hand − reserved − buffer[channel]`. Raw `on_hand` never leaves the system. *(Prior system pushed on_hand — do not.)*
2. **Reserve at ingestion, atomically.** Every order line reserves via a conditional `UpdateItem` (§7) before acking the channel. Correctness comes from the conditional write, never from periodic sync. *(Prior system had no reservation — this is the central fix.)*
3. **Idempotency everywhere.** Order ingestion, invoice creation, AWB creation, storno — keyed by a dedupe key at enqueue. Re-delivery is a no-op.
4. **Webhooks AND polling.** Every webhook is best-effort; a scheduled poll backfills misses. Never lose an order, never double a document.
5. **Event-driven for danger, cron for bulk.** Low-stock SKU change → Streams → immediate push (window = seconds). The 5-min cron survives only as drift reconciliation. *(Prior system relied solely on the 5-min cron — that window is the oversell hole.)*
6. **The legal invoice is the ANAF-accepted one.** SmartBill emission ≠ done. Poll SPV; "done" = `accepted`. Applies to forward invoices AND storno.
7. **Observability is a feature.** Detect *silence* (dead-man's switch per channel), not just errors. *(Trendyol died on a WAF block and no alarm fired — that is the bar this must clear.)*
8. **Adapters are isolated.** Each external system behind a typed interface (§8), built fresh, behind a feature flag.

---

## 5. Domain lifecycle (state machines)

**Stock unit/SKU:** `received → qc_pending → {qc_ok | qc_failed}` → `on_shelf` → `reserved` → `shipped`; returns re-enter at `qc_pending`.
**Order:** `ingested(reserved) → invoiced → awb_created → picking → packing → shipped → settled`; branches `cancelled` (release reservation), `returned` (→ RMA).
**RMA:** `requested → authorized → received → qc → {restock | scrap}` → `storno_issued → storno_confirmed(SPV)`.
**Invoice:** `created → spv_uploaded → {spv_accepted | spv_rejected}`.

---

## 6. Data model (DynamoDB) — recommended greenfield design

Single main table `core`, entity-prefixed keys. Stock counters on the StockLevel item. Separate `idempotency` table with TTL.

| Entity | PK | SK | Key attrs |
|---|---|---|---|
| Product/SKU | `SKU#<sku>` | `META` | **asin, gtin, ean**, serialized:bool, `buffer:{emag,trendyol,medusa}`, codaloc_ref |
| StockLevel | `SKU#<sku>` | `STOCK#<location>` | **on_hand**, **reserved** |
| PhysicalUnit *(serialized only)* | `SKU#<sku>` | `UNIT#<serial>` | status, location, order_id, awb |
| Reservation | `ORDER#<channel>#<id>` | `RES#<sku>` | qty, status |
| Order | `ORDER#<channel>#<id>` | `META` | status, **maximum_date_for_shipment**, late_flag |
| OrderLine | `ORDER#<channel>#<id>` | `LINE#<n>` | sku, qty |
| Invoice | `ORDER#<channel>#<id>` | `INVOICE#<smartbill_id>` | **spv_status**, spv_checked_at |
| Shipment/AWB | `ORDER#<channel>#<id>` | `AWB#<id>` | courier, awb, label_ref, status, bulk_batch_id |
| RMA | `RMA#<id>` | `META` | order_id, units[], storno_invoice_id, status |
| ChannelSyncState | `CHANNEL#<name>` | `SYNC` | **last_ok_sync**, last_error, error_rate_5m |
| GoodsReceipt/NIR | `NIR#<id>` | `META` | supplier, lines[], created_at |

**GSIs (sparse — set key only while relevant):**
- **GSI1 ship deadline:** `GSI1PK=SHIPQ#<channel>`, `GSI1SK=<max_ship_date ISO>`, set while status ∈ {ingested, picking, packing} → deadline-sorted picking queue.
- **GSI2 invoices missing SPV:** `GSI2PK=SPV#PENDING`, `GSI2SK=<created_at>`, set while `spv_status != accepted` → reconciliation sweep.
- ChannelSyncState: few items, read directly.

---

## 7. The reservation primitive (the heart of the system)

```text
UpdateItem  core { PK: SKU#<sku>, SK: STOCK#<location> }
  UpdateExpression:     SET reserved = reserved + :q, updatedAt = :now
  ConditionExpression:  (on_hand - reserved) >= :q
```
- Runs **inside order ingestion, before acking the channel**.
- `ConditionalCheckFailed` ⇒ no stock ⇒ mark line `oversold`, do NOT ship, alarm. You caught it instead of shipping blind.
- **Release:** on `ship` → decrement `on_hand` AND `reserved`; on `cancel` → decrement `reserved` only.
- Mandatory test: two parallel reservations on the last unit → exactly one succeeds.
- **Implementation note (DynamoDB):** ConditionExpressions can't do arithmetic, so the gate is implemented against a stored `available` counter (INVARIANT: `available == on_hand − reserved`) — condition `available >= :q`, and every stock mutation maintains the invariant atomically. The conceptual rule above is unchanged; don't revert it to `(on_hand − reserved) >= :q` in a ConditionExpression — DynamoDB rejects it.

---

## 8. Integrations (adapters, built fresh behind interfaces)

```ts
interface ChannelAdapter {        // eMAG v4.5.1 | Trendyol partner | Medusa
  fetchOrders(since): Order[];     // + a poll variant (principle §4)
  pushAvailable(sku, qty): void;   // pushes computeAvailable(), never on_hand
  ackOrder(id): void;
  fetchShipDeadline(order): Date;  // eMAG: maximum_date_for_shipment
}
interface InvoiceAdapter {         // SmartBill
  createInvoice(order): InvoiceRef;          // SmartBill creates + attaches; SmartBill transmits to ANAF
  reverseInvoice(invoiceRef): InvoiceRef;    // storno
  getSpvStatus(invoiceRef): 'uploaded'|'accepted'|'rejected'|'blocked';
}
interface CourierAdapter {         // Innoship — it picks the courier
  createAwb(shipment): AwbRef;     // single
  createAwbBulk(shipments): AwbRef[];        // bulk
  getLabel(awbRef): Buffer;
  track(awbRef): Status;
}
```
**Network:** route outbound calls through a **static egress IP (NAT Gateway / fixed EIP)** so partner WAF allowlists don't break on IP rotation. One connectivity canary per channel (§12).

---

## 9. Known behavior to replicate (rebuild fresh — this is how the prior system worked)

> Reproduce these behaviors in the new build. They are documented requirements, not existing code.

**Catalog & barcode.** Products are keyed by **asin / gtin / ean**. Barcode scanning resolves to a SKU via a **CODALOC / GS1** mapping — build this resolver fresh (`scan → SKU`).

**Receiving / NIR.** Scan-at-receiving resolves the SKU (CODALOC/GS1). **NIR auto-generation did not exist** → build it now: receiving a confirmed delivery generates the NIR document automatically from scan data and loads stock.

**eMAG.** Orders arrive via **eMAG order notification → callback** (with callback set, eMAG stops email notifications). **AWB generation must support single AND bulk** (the prior system did both). The eMAG payload carries **`maximum_date_for_shipment`** and **`late_shipment`** — previously ignored; they must drive SLA sorting (§ P4). API **v4.5.1**.

**Trendyol.** Partner API (product, stock/price, orders, invoice). The prior integration was **blocked by Cloudflare WAF (IP allowlist)** and failed silently → the new build must use a **static egress IP** and a **connectivity canary** so this is caught instantly and doesn't recur.

**Medusa.** Own storefront, previously **separate and unsynced** → in the new build it is just another `ChannelAdapter` on the central stock, with the same reservation + available-to-sell rules.

**Invoicing (SmartBill).** SmartBill **creates and attaches** the invoice. **The e-Factura/ANAF (SPV) transmission happens on SmartBill's side — the app does NOT build or transmit the XML itself.** So `createInvoice` calls SmartBill (which handles ANAF); the app's responsibility is to **trigger creation reliably on the `shipped` transition** (prior system was *not* 100% auto on shipped) and to **poll SPV acceptance**. **Storno** exists via SmartBill (prior route `/smartbill/invoice/reverse`) but was **manual** → auto-trigger it from RMA.

**Courier/AWB.** Prior system was **mono-courier** → new build uses **Innoship** multi-courier aggregation (Innoship picks least-cost across FAN / Cargus / Sameday / DPD / GLS).

**SAF-T / D406.** Handled **only through SmartBill**, not in-app → keep that boundary (§10).

**Returns.** Only a **`damaged` status** existed — no RMA/packing flow → build the full RMA state machine (§5) that triggers storno.

**Serial / IMEI.** **None existed** → build PhysicalUnit tracking for serialized SKUs (capture at receiving + packing, verify on return).

**Ops surface.** A simple **`/api/health`** endpoint and **Slack notifications on new orders + low stock** existed. Keep both; expand monitoring per §12 (the Slack channel is already wired).

**Stock sync.** Was a **~5-minute cron pushing on_hand, with no reservation** → replace with reservation-at-ingestion (§7) + available-to-sell push + Streams immediate push for low-stock; cron remains only for drift reconciliation.

---

## 10. What NOT to build (rented infrastructure)

| Concern | Owner | Why not in-app |
|---|---|---|
| e-Factura XML + ANAF SPV transport | **SmartBill** | Moving compliance target; legal validity = the ANAF-validated XML |
| SAF-T / D406 | **SmartBill / accountant** | ANAF changes the spec; reimplementing = permanent maintenance debt |
| Courier labels + multi-courier routing | **Innoship** | One API gives all couriers + least-cost routing |
| DAC7 / GPSR | **Operational** | DAC7 is reported by the marketplace about you; GPSR is product labeling/docs |

The app *triggers* and *tracks* these (e.g. calls `createInvoice`, then polls `getSpvStatus`); it does not own the protocol.

---

## 11. Build phases (sequence — do not reorder)

- **P0** Scaffold: IaC, tables, API Gateway + webhook/health handlers, SQS+DLQ per action, adapter interfaces with stubs, scheduler with empty poll handlers. Deployable end to end, no business logic.
- **P1** Oversell: reservation primitive + available-to-sell push + Streams immediate push + per-channel buffer. **(Critical — ship first.)**
- **P2** Monitoring: dead-man's switch per channel, DLQ alarms, error-rate alarms, external canaries, Slack + dashboard.
- **P3** ANAF confirmation: SPV poll for every invoice + RMA→storno auto-trigger + storno SPV confirm + daily reconciliation.
- **P4** eMAG SLA: picking queue sorted by `maximum_date_for_shipment`, deadline alerts, `late_shipment` KPI.
- **P5** Serial/IMEI: PhysicalUnit capture at receiving + packing, return verification. Gated on `serialized=true`.
- **P6** Backup/restore: confirm PITR per table, AWS Backup retention, tested restore drill into staging, break-glass IAM.

---

## 12. Non-functionals

- **Retries:** exponential backoff + jitter on every adapter call; permanent failures → DLQ.
- **Alarms (minimum):** channel `last_ok_sync` age > 15 min · any DLQ depth > 0 · channel 4xx/5xx spike · invoice `spv_status` rejected/blocked · order past `maximum_date_for_shipment` unshipped · external canary fail per channel.
- **Security:** least-privilege IAM per Lambda · secrets in SSM/Secrets Manager · **break-glass IAM account with offline MFA** (SSO failure must not lock you out mid-incident) · PITR per table.
- **DR:** quarterly restore drill — restore from PITR into a new table, point staging at it, verify integrity, record RTO/RPO.
- **Testing:** the concurrent-reservation test is mandatory and is the canary for the whole design.

---

## 13. Paste-ready phase prompts

> Give the agent §1–§12 as context first (the `CLAUDE.md`). Then paste one block per session. Everything is built from scratch — there is no existing code.

**P0 — Scaffold (greenfield)**
> Build the skeleton from scratch per §2–§3. IaC for the `core` and `idempotency` tables (PITR on, keys/GSIs from §6). API Gateway HTTP API with handlers for `/webhooks/emag`, `/webhooks/trendyol`, `/webhooks/medusa`, `POST /invoices/{orderId}/reverse`, `POST /rma/...`, and `GET /api/health` — each validates, writes an idempotency key, enqueues to SQS, returns fast. One SQS queue + DLQ for each of: order, invoice, awb, storno, push. The three adapter interfaces from §8 with stub implementations behind feature flags. EventBridge Scheduler with empty poll handlers. Deployable end to end, no business logic yet.

**P1 — Oversell (ship first)**
> Implement §7 and §4.1–4.2 from scratch. Deliver: (a) order-ingestion worker that reserves every line via the conditional UpdateItem before acking the channel, handling ConditionalCheckFailed by marking the line `oversold` + emitting an alarm event; (b) `computeAvailable(sku, channel)` used by all channel pushes — assert nothing pushes raw on_hand; (c) a DynamoDB Streams consumer that, when a StockLevel change crosses below `buffer[channel]`, immediately pushes updated availability to all channels; (d) reservation release on ship/cancel. Write the concurrent-reservation test (§12). No invoicing/AWB this phase.

**P2 — Monitoring**
> Implement §4.7 + §12 alarms. Per-channel `last_ok_sync` written on every successful sync + a scheduled checker alarming when age > 15 min; CloudWatch alarms on every DLQ depth > 0; per-channel API error-rate alarms; CloudWatch Synthetics canaries hitting each channel's auth from outside (this is what would have caught the Trendyol WAF block); SNS → Slack; a dashboard of last-sync-age, error rate, DLQ depth per channel. Verify by simulating a channel going silent.

**P3 — ANAF confirmation + storno**
> Implement §4.6 + RMA→storno. Build: a poller calling `getSpvStatus` for every invoice with `spv_status != accepted` (GSI2), marking accepted / alarming on rejected/blocked with retry; an RMA flow that on `received + qc_ok|scrap` calls `reverseInvoice` automatically (idempotent) and then tracks the storno's SPV status the same way; a daily reconciliation alarming on any invoice or storno emitted but not ANAF-confirmed within X hours. Remember: the app does not transmit XML — SmartBill does; the app triggers + confirms.

**P4 — eMAG SLA**
> Use `maximum_date_for_shipment` (already in the eMAG payload). Build: GSI1 populated for unshipped orders; picking/packing queue sorted ascending by ship deadline; a scheduled alert for orders with deadline within 2h still unshipped (Slack + UI flag); a `late_shipment` daily KPI. Tie stockout cancellations back to the P1 oversold signal.

**P5 — Serial / IMEI**
> Gated on `serialized=true`. Build PhysicalUnit records (§6) captured at receiving-scan and packing (serial ↔ order ↔ AWB), plus return verification that scans the serial and confirms it matches the unit originally shipped, blocking mismatches. No-op for non-serialized SKUs.

**P6 — Backup / restore + break-glass**
> Confirm PITR is ON per table. Add AWS Backup plans for retention beyond 35 days (ideally cross-region/account). Script + document a restore drill: restore from PITR into a new table, point a staging stack at it, run an integrity check, record RTO/RPO. Create the break-glass IAM account (§12) with MFA stored offline. Deliver a runbook for both.
