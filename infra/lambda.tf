# Lambda functions — the whole P0 surface. Each handler is bundled by `npm run build` into
# dist/<name>/index.js (function key == handler file basename); archive_file zips it. Run the build
# before plan/apply. Per-function capabilities (queues, secrets, table access) are declared here and
# turned into least-privilege IAM in iam.tf.

locals {
  # Env every function gets. Handlers read queue URLs / table names from these.
  base_env = {
    CORE_TABLE        = aws_dynamodb_table.core.name
    IDEMPOTENCY_TABLE = aws_dynamodb_table.idempotency.name
    ORDER_QUEUE_URL   = aws_sqs_queue.main["order"].url
    INVOICE_QUEUE_URL = aws_sqs_queue.main["invoice"].url
    AWB_QUEUE_URL     = aws_sqs_queue.main["awb"].url
    STORNO_QUEUE_URL  = aws_sqs_queue.main["storno"].url
    PUSH_QUEUE_URL    = aws_sqs_queue.main["push"].url
  }

  # Per-function spec. Optional keys (consumed by iam.tf via try()):
  #   idempotency   = true            -> dynamodb:PutItem on the idempotency table
  #   core_rw       = true            -> read/write the core table (+ indexes)
  #   send_queues   = [..]            -> sqs:SendMessage to those queues
  #   sqs_source    = "order"         -> SQS event source + consume perms on that queue
  #   secret_params = ["webhook/..."] -> ssm:GetParameter on those params + kms:Decrypt on the CMK
  #   env           = {..}            -> extra env merged over base_env
  functions = {
    # --- synchronous edge (API Gateway) ---
    "health" = {}

    "webhook-emag" = {
      idempotency   = true
      send_queues   = ["order"]
      secret_params = ["webhook/emag"]
      env           = { WEBHOOK_SECRET_EMAG = aws_ssm_parameter.secret["webhook/emag"].name }
    }
    "webhook-trendyol" = {
      idempotency   = true
      send_queues   = ["order"]
      secret_params = ["webhook/trendyol"]
      env           = { WEBHOOK_SECRET_TRENDYOL = aws_ssm_parameter.secret["webhook/trendyol"].name }
    }
    "webhook-medusa" = {
      idempotency   = true
      send_queues   = ["order"]
      secret_params = ["webhook/medusa"]
      env           = { WEBHOOK_SECRET_MEDUSA = aws_ssm_parameter.secret["webhook/medusa"].name }
    }
    "invoice-reverse" = {
      idempotency = true
      send_queues = ["storno"]
    }
    "rma" = {
      idempotency = true
      send_queues = ["storno"]
    }

    # --- scheduled polls (EventBridge Scheduler) ---
    "poll-emag" = {
      send_queues   = ["order"]
      secret_params = ["partner/emag"]
      env = {
        ADAPTER_EMAG        = "false"
        PARTNER_SECRET_EMAG = aws_ssm_parameter.secret["partner/emag"].name
      }
    }
    "poll-trendyol" = {
      send_queues   = ["order"]
      secret_params = ["partner/trendyol"]
      env = {
        ADAPTER_TRENDYOL        = "false"
        PARTNER_SECRET_TRENDYOL = aws_ssm_parameter.secret["partner/trendyol"].name
      }
    }
    "poll-medusa" = {
      send_queues   = ["order"]
      secret_params = ["partner/medusa"]
      env = {
        ADAPTER_MEDUSA        = "false"
        PARTNER_SECRET_MEDUSA = aws_ssm_parameter.secret["partner/medusa"].name
      }
    }

    # --- async workers (SQS) ---
    "worker-order" = {
      sqs_source    = "order"
      core_rw       = true
      idempotency   = true
      secret_params = ["partner/emag", "partner/trendyol", "partner/medusa"]
      env = {
        # Needed to ack the channel after reserving (flag-gated; off until the adapter is implemented).
        ADAPTER_EMAG            = "false"
        ADAPTER_TRENDYOL        = "false"
        ADAPTER_MEDUSA          = "false"
        PARTNER_SECRET_EMAG     = aws_ssm_parameter.secret["partner/emag"].name
        PARTNER_SECRET_TRENDYOL = aws_ssm_parameter.secret["partner/trendyol"].name
        PARTNER_SECRET_MEDUSA   = aws_ssm_parameter.secret["partner/medusa"].name
      }
    }
    "worker-invoice" = {
      sqs_source    = "invoice"
      core_rw       = true
      secret_params = ["partner/smartbill"]
      env           = { PARTNER_SECRET_SMARTBILL = aws_ssm_parameter.secret["partner/smartbill"].name }
    }
    "worker-awb" = {
      sqs_source    = "awb"
      core_rw       = true
      secret_params = ["partner/innoship"]
      env           = { PARTNER_SECRET_INNOSHIP = aws_ssm_parameter.secret["partner/innoship"].name }
    }
    "worker-storno" = {
      sqs_source    = "storno"
      core_rw       = true
      secret_params = ["partner/smartbill"]
      env           = { PARTNER_SECRET_SMARTBILL = aws_ssm_parameter.secret["partner/smartbill"].name }
    }
    "worker-push" = {
      sqs_source    = "push"
      core_rw       = true
      secret_params = ["partner/emag", "partner/trendyol", "partner/medusa"]
      env = {
        PARTNER_SECRET_EMAG     = aws_ssm_parameter.secret["partner/emag"].name
        PARTNER_SECRET_TRENDYOL = aws_ssm_parameter.secret["partner/trendyol"].name
        PARTNER_SECRET_MEDUSA   = aws_ssm_parameter.secret["partner/medusa"].name
      }
    }

    # --- DynamoDB Streams consumer (immediate low-stock availability push, §4.5) ---
    "stream-stock" = {
      core_read     = true
      stream_source = true
      secret_params = ["partner/emag", "partner/trendyol", "partner/medusa"]
      env = {
        ADAPTER_EMAG            = "false"
        ADAPTER_TRENDYOL        = "false"
        ADAPTER_MEDUSA          = "false"
        PARTNER_SECRET_EMAG     = aws_ssm_parameter.secret["partner/emag"].name
        PARTNER_SECRET_TRENDYOL = aws_ssm_parameter.secret["partner/trendyol"].name
        PARTNER_SECRET_MEDUSA   = aws_ssm_parameter.secret["partner/medusa"].name
      }
    }
  }
}

data "archive_file" "lambda" {
  for_each = local.functions

  type        = "zip"
  source_dir  = "${path.module}/../dist/${each.key}"
  output_path = "${path.module}/build/${each.key}.zip"
}

resource "aws_lambda_function" "fn" {
  for_each = local.functions

  function_name = "${local.prefix}-${each.key}"
  role          = aws_iam_role.lambda[each.key].arn
  runtime       = var.lambda_runtime
  handler       = "index.handler"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.lambda[each.key].output_path
  source_code_hash = data.archive_file.lambda[each.key].output_base64sha256

  environment {
    variables = merge(local.base_env, try(each.value.env, {}))
  }
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.functions

  name              = "/aws/lambda/${local.prefix}-${each.key}"
  retention_in_days = 30
}

# SQS → worker wiring, with partial-batch-failure reporting so only failed messages retry → DLQ.
resource "aws_lambda_event_source_mapping" "worker" {
  for_each = { for k, v in local.functions : k => v if try(v.sqs_source, null) != null }

  event_source_arn                   = aws_sqs_queue.main[each.value.sqs_source].arn
  function_name                      = aws_lambda_function.fn[each.key].arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

# DynamoDB Streams → stock consumer. Filtered to StockLevel items (SK = STOCK#*) so order/line/
# reservation writes don't trigger it. bisect-on-error isolates a poison record from its batch.
resource "aws_lambda_event_source_mapping" "stream" {
  for_each = { for k, v in local.functions : k => v if try(v.stream_source, false) }

  event_source_arn                   = aws_dynamodb_table.core.stream_arn
  function_name                      = aws_lambda_function.fn[each.key].arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  bisect_batch_on_function_error     = true
  function_response_types            = ["ReportBatchItemFailures"]

  filter_criteria {
    filter {
      pattern = jsonencode({ dynamodb = { Keys = { SK = { S = [{ prefix = "STOCK#" }] } } } })
    }
  }
}
