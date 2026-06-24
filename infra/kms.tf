# Customer-managed KMS key for secret encryption (§12). NOT the default aws/ssm key — so we own
# the key policy and get CloudTrail on every Decrypt. Each Lambda role is granted kms:Decrypt on
# this key ARN only (least-privilege, in iam.tf).

resource "aws_kms_key" "secrets" {
  description             = "${local.prefix} secrets CMK"
  enable_key_rotation     = true
  deletion_window_in_days = var.env == "prod" ? 30 : 7
  # Default key policy (account root) is intentional: it lets IAM role policies govern access,
  # which is how the per-Lambda least-privilege kms:Decrypt grants take effect.
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${local.prefix}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}
