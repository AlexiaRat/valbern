# valbern — WMS + Multichannel E-Commerce Orchestrator

Owns the warehouse→marketplace pipeline (receiving → QC → stock → orders → invoicing →
AWB → ship → returns → reconciliation) across **eMAG**, **Trendyol**, and **Medusa**.

The system **orchestrates**; it does not reimplement e-invoicing transport, SAF-T, or courier
labels — those are rented (SmartBill / Innoship). This is a **greenfield** build — no legacy code.
The full spec and the non-negotiable architectural principles live in [`CLAUDE.md`](./CLAUDE.md).
Read it before changing anything.

## Status

**P0 — Scaffold (complete).** Deployable skeleton:

- Terraform for the `core` + `idempotency` DynamoDB tables (PITR per table, GSI1/GSI2, TTL, Streams).
- **API Gateway HTTP API** edge: `POST /webhooks/{emag,trendyol,medusa}` (HMAC/secret verified),
  `POST /invoices/{orderId}/reverse` + `POST /rma/{action}` (AWS_IAM auth), `GET /api/health`.
  Each edge handler validates → claims an idempotency key → enqueues to SQS → returns fast.
- One SQS queue + DLQ for each of: order, invoice, awb, storno, push — with worker Lambdas
  (partial-batch-failure reporting) wired via event source mappings.
- The three adapter interfaces (§8) with stub implementations behind feature flags.
- EventBridge Scheduler wired to per-channel poll handlers.
- **Secrets:** customer-managed KMS key + SSM SecureString params (per partner + per webhook),
  least-privilege IAM per Lambda (each reads only the secret ARNs it needs + `kms:Decrypt` on the CMK).

**P1 — Oversell (complete).** The reservation guarantee — ship this first:

- **Reservation primitive** (`src/stock/reserve.ts`, §7): one atomic `TransactWriteItems` reserves a
  line (gated on a stored `available` counter, since DynamoDB conditions can't do arithmetic) and
  records the reservation. Two parallel writers on the last unit → exactly one wins; the loser is
  `oversold`, not shipped. Release on ship/cancel included.
- **Order-ingestion worker** (`worker-order`): normalize → reserve every line **before** acking the
  channel; `ConditionalCheckFailed` ⇒ line marked `oversold` + an EMF oversell metric is emitted.
- **`computeAvailable(sku, channel)`** = `on_hand − reserved − buffer[channel]`, floored — the single
  rule all channel pushes go through; raw `on_hand` never leaves the system.
- **DynamoDB Streams consumer** (`stream-stock`): on any StockLevel change, immediately recomputes and
  pushes available-to-sell to all channels (low-stock danger handled in seconds, not by the cron).
- **Mandatory §12 concurrency test** passes against DynamoDB Local (8/8).

Verified: `tsc --noEmit` clean, 15 handlers bundled, tests green (DDB Local), `terraform validate`
passes. Not yet deployed.

### Running the tests

```bash
npm run db:up      # DynamoDB Local on :8000 (needs Docker)
npm test           # vitest — incl. the concurrent-reservation canary
npm run db:down
```

If your Docker engine isn't exposed to WSL, run DynamoDB Local on the host and point the suite at it:
`DDB_ENDPOINT=http://<host-ip>:8000 npm test`.

## Layout

```
CLAUDE.md            # build spec — persistent context, read every session
src/
  domain/            # entity types (§6) + single-table key builders
  adapters/          # §8 interfaces, stubs, feature flags
    channel/         #   eMAG | Trendyol | Medusa
    invoice/         #   SmartBill
    courier/         #   Innoship (single + bulk AWB)
  stock/             # reservation primitive, release, computeAvailable, availability push
  ingestion/         # order message normalize + ingest (reserve every line)
  metrics/           # CloudWatch EMF (oversell / low-stock signals)
  db/                # shared DynamoDB document client (DDB_ENDPOINT-aware for tests)
  http/              # edge runner, idempotency claim, webhook signature, order-id extraction
  secrets/           # cached SSM SecureString fetch (KMS-decrypted)
  sqs/               # enqueue helper
  worker/            # shared SQS worker skeleton
  handlers/          # Lambda entrypoints (webhooks, ops, health, polls, workers, stream)
tests/               # vitest — reservation/concurrency against DynamoDB Local
scripts/build.mjs    # esbuild → dist/<handler>/index.js (one bundle per Lambda)
infra/               # Terraform (tables, queues, KMS, secrets, API GW, scheduler, lambdas, IAM)
```

## Develop

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest
npm run build          # bundle handlers into dist/
```

## Deploy

```bash
npm run build                                   # dist/ must exist before plan/apply
terraform -chdir=infra init
terraform -chdir=infra plan  -var="env=dev"
terraform -chdir=infra apply -var="env=dev"
```

After apply, populate the placeholder secrets out-of-band (Terraform never holds real values):

```bash
aws ssm put-parameter --overwrite --type SecureString \
  --name /valbern/dev/secrets/partner/emag --value '<real-credential>'
# ...repeat for each name in the `secret_parameter_names` output
```

Secrets (channel / SmartBill / Innoship credentials, webhook signing secrets) are **never** in
Terraform state or env literals — only the SSM parameter *name* is passed to a Lambda; the value
is fetched + KMS-decrypted at runtime (§2/§12).
