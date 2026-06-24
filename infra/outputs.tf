output "api_endpoint" {
  description = "Base URL of the HTTP API ($default stage)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "core_table_name" {
  value = aws_dynamodb_table.core.name
}

output "core_table_stream_arn" {
  description = "DynamoDB Stream ARN — consumed by the P1 low-stock push Lambda."
  value       = aws_dynamodb_table.core.stream_arn
}

output "idempotency_table_name" {
  value = aws_dynamodb_table.idempotency.name
}

output "sqs_queue_urls" {
  value = { for k, q in aws_sqs_queue.main : k => q.url }
}

output "sqs_dlq_arns" {
  value = { for k, q in aws_sqs_queue.dlq : k => q.arn }
}

output "lambda_arns" {
  value = { for k, fn in aws_lambda_function.fn : k => fn.arn }
}

output "secrets_kms_key_arn" {
  value = aws_kms_key.secrets.arn
}

output "secret_parameter_names" {
  description = "SSM SecureString parameter names to populate out-of-band (values start as placeholders)."
  value       = { for k, p in aws_ssm_parameter.secret : k => p.name }
}
