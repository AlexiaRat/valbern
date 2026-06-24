# Least-privilege IAM, one role PER Lambda (§12). Permissions are derived from each function's spec
# in local.functions — a function gets ONLY the statements its declared capabilities require.

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  for_each = local.functions

  name               = "${local.prefix}-${each.key}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda" {
  for_each = local.functions

  # Always: write to this function's own log group only.
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${local.prefix}-${each.key}",
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${local.prefix}-${each.key}:*",
    ]
  }

  dynamic "statement" {
    for_each = try(each.value.idempotency, false) ? [1] : []
    content {
      sid       = "IdempotencyWrite"
      actions   = ["dynamodb:PutItem"]
      resources = [aws_dynamodb_table.idempotency.arn]
    }
  }

  dynamic "statement" {
    for_each = try(each.value.core_rw, false) ? [1] : []
    content {
      sid       = "CoreReadWrite"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
      resources = [aws_dynamodb_table.core.arn, "${aws_dynamodb_table.core.arn}/index/*"]
    }
  }

  dynamic "statement" {
    for_each = length(try(each.value.send_queues, [])) > 0 ? [1] : []
    content {
      sid       = "SqsSend"
      actions   = ["sqs:SendMessage"]
      resources = [for q in each.value.send_queues : aws_sqs_queue.main[q].arn]
    }
  }

  dynamic "statement" {
    for_each = try(each.value.sqs_source, null) != null ? [1] : []
    content {
      sid       = "SqsConsume"
      actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      resources = [aws_sqs_queue.main[each.value.sqs_source].arn]
    }
  }

  dynamic "statement" {
    for_each = length(try(each.value.secret_params, [])) > 0 ? [1] : []
    content {
      sid       = "SecretsRead"
      actions   = ["ssm:GetParameter", "ssm:GetParameters"]
      resources = [for k in each.value.secret_params : aws_ssm_parameter.secret[k].arn]
    }
  }

  # kms:Decrypt only on our CMK, and only for functions that actually read a secret.
  dynamic "statement" {
    for_each = length(try(each.value.secret_params, [])) > 0 ? [1] : []
    content {
      sid       = "SecretsDecrypt"
      actions   = ["kms:Decrypt"]
      resources = [aws_kms_key.secrets.arn]
    }
  }
}

resource "aws_iam_role_policy" "lambda" {
  for_each = local.functions

  name   = "least-priv"
  role   = aws_iam_role.lambda[each.key].id
  policy = data.aws_iam_policy_document.lambda[each.key].json
}
