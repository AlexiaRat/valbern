# §5 data model. Single `core` table (entity-prefixed keys) + separate `idempotency` table.
# PITR is enabled PER TABLE here (§2 — it is not account-wide). On-demand billing.

resource "aws_dynamodb_table" "core" {
  name         = "${local.prefix}-core"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  # GSI1 — ship-deadline picking queue (sparse). SHIPQ#<channel> / <max_ship_date ISO>.
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }
  # GSI2 — invoices missing SPV acceptance (sparse). SPV#PENDING / <created_at>.
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  # Streams drive the immediate low-stock channel push (§3.5 / P1) and serial flows (P5).
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = var.env == "prod"
}

resource "aws_dynamodb_table" "idempotency" {
  name         = "${local.prefix}-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"

  attribute {
    name = "PK"
    type = "S"
  }

  # Dedupe keys self-expire (§3.3 / §5: "idempotency table with TTL").
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = var.env == "prod"
}
