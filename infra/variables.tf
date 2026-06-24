variable "project" {
  description = "Project/name prefix for all resources."
  type        = string
  default     = "valbern"
}

variable "env" {
  description = "Deployment environment (dev | staging | prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, staging, prod."
  }
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "eu-central-1"
}

variable "poll_schedule" {
  description = "EventBridge Scheduler rate for the per-channel order polls (§4 backfill)."
  type        = string
  default     = "rate(5 minutes)"
}

variable "dlq_max_receive_count" {
  description = "Deliveries attempted before a message is moved to its DLQ."
  type        = number
  default     = 5
}

variable "lambda_runtime" {
  type    = string
  default = "nodejs20.x"
}
