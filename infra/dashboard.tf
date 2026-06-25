# CloudWatch dashboard (§10 / P2): last-sync-age, API errors, DLQ depth, and canary success per
# channel — the one screen to see whether the pipeline is healthy.

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.prefix}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Sync age per channel (s) — alarm > ${var.sync_age_alarm_seconds}"
          view    = "timeSeries"
          region  = var.region
          stat    = "Maximum"
          period  = 300
          metrics = [for c in local.channels : ["Valbern/Monitoring", "SyncAgeSeconds", "Channel", c]]
          annotations = {
            horizontal = [{ label = "threshold", value = var.sync_age_alarm_seconds }]
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "API errors per channel"
          view    = "timeSeries"
          region  = var.region
          stat    = "Sum"
          period  = 300
          metrics = [for c in local.channels : ["Valbern/Monitoring", "ChannelApiErrors", "Channel", c]]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "DLQ depth per action"
          view    = "timeSeries"
          region  = var.region
          stat    = "Maximum"
          period  = 60
          metrics = [for a in local.sqs_actions : ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.dlq[a].name]]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Canary success % per channel"
          view    = "timeSeries"
          region  = var.region
          stat    = "Average"
          period  = 300
          metrics = [for k, c in aws_synthetics_canary.channel : ["CloudWatchSynthetics", "SuccessPercent", "CanaryName", c.name]]
        }
      },
    ]
  })
}
