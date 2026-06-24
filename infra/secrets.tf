# Partner credentials + webhook signing secrets (§12). Stored as SSM Parameter Store SecureString
# (cheap, fine for rarely-rotated creds) encrypted with the customer-managed CMK. Terraform creates
# the parameter CONTAINERS with a placeholder; real values are written out-of-band
# (`aws ssm put-parameter --overwrite ...`) and `ignore_changes` keeps Terraform from clobbering
# them. No real secret ever lives in code or state. Swap a specific one to Secrets Manager later if
# you want automatic rotation.

locals {
  # `webhook/*` = inbound callback signing/shared secrets (§ verify webhook).
  # `partner/*` = outbound API credentials per vendor.
  secret_keys = [
    "webhook/emag",
    "webhook/trendyol",
    "webhook/medusa",
    "partner/emag",
    "partner/trendyol",
    "partner/medusa",
    "partner/smartbill",
    "partner/innoship",
  ]
}

resource "aws_ssm_parameter" "secret" {
  for_each = toset(local.secret_keys)

  name   = "/${var.project}/${var.env}/secrets/${each.key}"
  type   = "SecureString"
  key_id = aws_kms_key.secrets.id
  value  = "REPLACE_ME" # placeholder — overwrite out-of-band; never a real secret

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Kind = startswith(each.key, "webhook/") ? "webhook-secret" : "partner-credential"
  }
}
