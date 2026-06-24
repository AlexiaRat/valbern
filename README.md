# valbern — WMS + Multichannel E-Commerce Orchestrator

Owns the warehouse→marketplace pipeline (receiving → QC → stock → orders → invoicing →
AWB → ship → returns → reconciliation) across **eMAG**, **Trendyol**, and **Medusa**.

The system **orchestrates**; it does not reimplement e-invoicing transport, SAF-T, or courier
labels — those are rented (SmartBill / Innoship). This is a **greenfield** build — no legacy code.
The full spec and the non-negotiable architectural principles live in [`CLAUDE.md`](./CLAUDE.md).
Read it before changing anything.

## Status

**Phase P0 — Scaffold (complete).** Deployable skeleton, no business logic yet:

- Terraform for the `core` + `idempotency` DynamoDB tables (PITR per table, GSI1/GSI2, TTL, Streams).
- **API Gateway HTTP API** edge: `POST /webhooks/{emag,trendyol,medusa}` (HMAC/secret verified),
  `POST /invoices/{orderId}/reverse` + `POST /rma/{action}` (AWS_IAM auth), `GET /api/health`.
  Each edge handler validates → claims an idempotency key → enqueues to SQS → returns fast.
- One SQS queue + DLQ for each of: order, invoice, awb, storno, push — with worker Lambda stubs
  (partial-batch-failure reporting) wired via event source mappings.
- The three adapter interfaces (§8) with stub implementations behind feature flags.
- EventBridge Scheduler wired to empty per-channel poll handlers.
- **Secrets:** customer-managed KMS key + SSM SecureString params (per partner + per webhook),
  least-privilege IAM per Lambda (each reads only the secret ARNs it needs + `kms:Decrypt` on the CMK).

Verified: `tsc --noEmit` clean, 14 handlers bundled, `terraform validate` passes. Not yet deployed.

## Layout

```
CLAUDE.md            # build spec — persistent context, read every session
src/
  domain/            # entity types (§6) + single-table key builders
  adapters/          # §8 interfaces, stubs, feature flags
    channel/         #   eMAG | Trendyol | Medusa
    invoice/         #   SmartBill
    courier/         #   Innoship (single + bulk AWB)
  http/              # edge runner, idempotency claim, webhook signature, order-id extraction
  secrets/           # cached SSM SecureString fetch (KMS-decrypted)
  sqs/               # enqueue helper
  worker/            # shared SQS worker skeleton
  handlers/          # Lambda entrypoints (webhooks, ops, health, polls, workers)
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
