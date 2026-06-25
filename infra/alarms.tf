# CloudWatch alarms (§10 minimum set). All publish to the alarms SNS topic → Slack. P3 adds the
# SPV rejected/blocked alarm; P4 adds the past-ship-deadline alarm.

# Any DLQ with depth > 0 — a message was permanently failed, never silently dropped (§10).
resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  for_each = toset(local.sqs_actions)

  alarm_name          = "${local.prefix}-dlq-${each.key}"
  alarm_description   = "DLQ ${each.key} has messages — investigate the failed integration action."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.dlq[each.key].name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# Dead-man's switch (§4.7): a channel that hasn't synced within the threshold — silence, not errors.
# treat_missing_data=breaching so a channel that never reported (or whose checker is down) alarms.
resource "aws_cloudwatch_metric_alarm" "sync_age" {
  for_each = toset(local.channels)

  alarm_name          = "${local.prefix}-sync-age-${each.key}"
  alarm_description   = "Channel ${each.key} has gone silent (last_ok_sync age > ${var.sync_age_alarm_seconds}s)."
  namespace           = "Valbern/Monitoring"
  metric_name         = "SyncAgeSeconds"
  dimensions          = { Channel = each.key }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.sync_age_alarm_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# Per-channel API error spike (§10). No calls ⇒ no data ⇒ not breaching.
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  for_each = toset(local.channels)

  alarm_name          = "${local.prefix}-api-errors-${each.key}"
  alarm_description   = "Channel ${each.key} API error count over threshold."
  namespace           = "Valbern/Monitoring"
  metric_name         = "ChannelApiErrors"
  dimensions          = { Channel = each.key }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.api_error_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}

# External canary failing for a channel (§8) — connectivity/WAF block detected from outside.
resource "aws_cloudwatch_metric_alarm" "canary" {
  for_each = aws_synthetics_canary.channel

  alarm_name          = "${local.prefix}-canary-${each.key}"
  alarm_description   = "Connectivity canary for ${each.key} is failing (possible partner WAF/allowlist block)."
  namespace           = "CloudWatchSynthetics"
  metric_name         = "SuccessPercent"
  dimensions          = { CanaryName = each.value.name }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = 100
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}
