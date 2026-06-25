# EventBridge Scheduler — cron/poll jobs (§2/§3). Any function in local.functions that declares a
# `schedule_expression` gets a schedule. P0/P1 polls + the P2 dead-man's-switch checker. SPV/SLA
# schedules are added in their phases (P3/P4).

locals {
  scheduled_functions = { for k, v in local.functions : k => v if try(v.schedule_expression, null) != null }
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

# Scheduler may invoke ONLY the scheduled Lambdas.
data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [for k in keys(local.scheduled_functions) : aws_lambda_function.fn[k].arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "invoke-scheduled-lambdas"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "scheduled" {
  for_each = local.scheduled_functions

  name = "${local.prefix}-${each.key}"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = each.value.schedule_expression
  schedule_expression_timezone = "Europe/Bucharest"

  target {
    arn      = aws_lambda_function.fn[each.key].arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
