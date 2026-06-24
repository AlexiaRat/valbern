# EventBridge Scheduler — cron/poll jobs (§2/§3). P0 wires one schedule per channel poll handler.
# Reconciliation / SLA / SPV schedules are added in their phases (P3/P4).

locals {
  poll_functions = { for k, v in local.functions : k => v if startswith(k, "poll-") }
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.prefix}-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

# Scheduler may invoke ONLY the poll Lambdas.
data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [for k in keys(local.poll_functions) : aws_lambda_function.fn[k].arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "invoke-poll-lambdas"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "poll" {
  for_each = local.poll_functions

  name = "${local.prefix}-${each.key}"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.poll_schedule
  schedule_expression_timezone = "Europe/Bucharest"

  target {
    arn      = aws_lambda_function.fn[each.key].arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
