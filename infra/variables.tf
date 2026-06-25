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

variable "sync_age_alarm_seconds" {
  description = "Dead-man's-switch threshold: alarm when a channel's last_ok_sync age exceeds this (§10)."
  type        = number
  default     = 900 # 15 min
}

variable "api_error_threshold" {
  description = "Alarm when per-channel API errors over the period exceed this."
  type        = number
  default     = 5
}

variable "canary_schedule" {
  description = "Run rate for the per-channel Synthetics connectivity canaries."
  type        = string
  default     = "rate(5 minutes)"
}

variable "canary_target_urls" {
  description = "External auth/health endpoint each channel canary probes from outside (§8). Set real URLs per env."
  type        = map(string)
  default = {
    emag     = "https://marketplace-api.emag.ro"
    trendyol = "https://api.trendyol.com"
    medusa   = "https://example.com" # own storefront — replace with the real Medusa URL
  }
}

variable "sync_age_check_schedule" {
  description = "Run rate for the dead-man's-switch checker Lambda."
  type        = string
  default     = "rate(5 minutes)"
}
