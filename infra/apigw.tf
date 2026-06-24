# API Gateway HTTP API (§3). Synchronous edge: webhooks + ops + health. Each route targets its
# Lambda via AWS_PROXY. Webhooks are public (authenticity verified in-handler by HMAC/secret, §
# verify webhook); ops routes (reverse, rma) require AWS_IAM (SigV4) — internal callers sign requests.

locals {
  http_routes = {
    "webhook-emag"     = { method = "POST", path = "/webhooks/emag", auth = "NONE" }
    "webhook-trendyol" = { method = "POST", path = "/webhooks/trendyol", auth = "NONE" }
    "webhook-medusa"   = { method = "POST", path = "/webhooks/medusa", auth = "NONE" }
    "health"           = { method = "GET", path = "/api/health", auth = "NONE" }
    "invoice-reverse"  = { method = "POST", path = "/invoices/{orderId}/reverse", auth = "AWS_IAM" }
    "rma"              = { method = "POST", path = "/rma/{action}", auth = "AWS_IAM" }
  }
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "http" {
  for_each = local.http_routes

  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.fn[each.key].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "http" {
  for_each = local.http_routes

  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "${each.value.method} ${each.value.path}"
  target             = "integrations/${aws_apigatewayv2_integration.http[each.key].id}"
  authorization_type = each.value.auth
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw" {
  for_each = local.http_routes

  statement_id  = "AllowApiGwInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
