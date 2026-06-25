provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      Env       = var.env
      ManagedBy = "terraform"
      Repo      = "valbern"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  prefix     = "${var.project}-${var.env}"
  account_id = data.aws_caller_identity.current.account_id
  channels   = ["emag", "trendyol", "medusa"]
}
