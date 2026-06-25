# CloudWatch Synthetics canaries (§8/§12) — one per channel, probing the partner auth endpoint from
# AWS-managed infra OUTSIDE our VPC. This is what would have caught the Trendyol WAF/allowlist block
# (silent failure) within minutes. start_canary=false: we don't auto-run until real TARGET_URLs are
# set and the stack is deployed.

resource "aws_s3_bucket" "canary_artifacts" {
  bucket        = "${local.prefix}-canary-artifacts-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "canary_artifacts" {
  bucket                  = aws_s3_bucket.canary_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "canary_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "canary" {
  name               = "${local.prefix}-canary-role"
  assume_role_policy = data.aws_iam_policy_document.canary_assume.json
}

data "aws_iam_policy_document" "canary" {
  statement {
    sid       = "Artifacts"
    actions   = ["s3:PutObject", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.canary_artifacts.arn, "${aws_s3_bucket.canary_artifacts.arn}/*"]
  }
  statement {
    sid       = "ListAllBuckets"
    actions   = ["s3:ListAllMyBuckets"]
    resources = ["*"]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/cwsyn-*"]
  }
  statement {
    sid       = "Metrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CloudWatchSynthetics"]
    }
  }
}

resource "aws_iam_role_policy" "canary" {
  name   = "canary"
  role   = aws_iam_role.canary.id
  policy = data.aws_iam_policy_document.canary.json
}

# Synthetics layout: zip contains nodejs/node_modules/channel-auth.js → handler channel-auth.handler.
data "archive_file" "canary" {
  type        = "zip"
  source_dir  = "${path.module}/../canary"
  output_path = "${path.module}/build/canary.zip"
}

resource "aws_synthetics_canary" "channel" {
  for_each = var.canary_target_urls

  name                 = "vlb-${var.env}-${each.key}" # canary names are <= 21 chars
  artifact_s3_location = "s3://${aws_s3_bucket.canary_artifacts.bucket}/${each.key}"
  execution_role_arn   = aws_iam_role.canary.arn
  runtime_version      = "syn-nodejs-puppeteer-9.0"
  handler              = "channel-auth.handler"
  zip_file             = data.archive_file.canary.output_path
  start_canary         = false

  schedule {
    expression = var.canary_schedule
  }

  run_config {
    timeout_in_seconds = 30
    environment_variables = {
      TARGET_URL = each.value
      CHANNEL    = each.key
    }
  }
}
