# §2: one SQS queue per integration action, EACH with a DLQ. Permanent failures land in the
# DLQ (§10) — never silently dropped. DLQ depth > 0 alarms in P2.

locals {
  # One queue per integration action (§2).
  sqs_actions = ["order", "invoice", "awb", "storno", "push"]
}

resource "aws_sqs_queue" "dlq" {
  for_each = toset(local.sqs_actions)

  name                      = "${local.prefix}-${each.key}-dlq"
  message_retention_seconds = 1209600 # 14 days — max, so failures are inspectable
}

resource "aws_sqs_queue" "main" {
  for_each = toset(local.sqs_actions)

  name                       = "${local.prefix}-${each.key}"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600 # 4 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = var.dlq_max_receive_count
  })
}

# Lock each DLQ so only its own source queue can redrive into it.
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  for_each = toset(local.sqs_actions)

  queue_url = aws_sqs_queue.dlq[each.key].id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.main[each.key].arn]
  })
}
