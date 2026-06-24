terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Remote state: wire up an S3 backend (+ DynamoDB lock) per environment before sharing.
  # Left local for P0 bootstrap so `terraform init` works with zero pre-existing infra.
  # backend "s3" {
  #   bucket         = "valbern-tfstate-<acct>"
  #   key            = "wms/terraform.tfstate"
  #   region         = "eu-central-1"
  #   dynamodb_table = "valbern-tflock"
  #   encrypt        = true
  # }
}
