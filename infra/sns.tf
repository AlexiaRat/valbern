# Alarm fan-out (§2 observability). Every CloudWatch alarm publishes here; the slack-notify Lambda
# forwards to Slack. One topic for all alarms keeps subscription management in one place.

resource "aws_sns_topic" "alarms" {
  name = "${local.prefix}-alarms"
}

resource "aws_sns_topic_subscription" "slack" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.fn["slack-notify"].arn
}

resource "aws_lambda_permission" "sns_invoke_slack" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn["slack-notify"].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alarms.arn
}
